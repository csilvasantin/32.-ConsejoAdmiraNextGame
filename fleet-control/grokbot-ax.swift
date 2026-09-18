// Local macOS Accessibility bridge. One JSON request per process, stdout JSON.
// No Apple Events, private web APIs, browser debugging, tokens, window movement
// or permission prompts. Only select/send perform AX actions.
import Cocoa
import ApplicationServices
import CryptoKit
import Darwin

let supportedPersonas = ["Steve Jobs", "Steve Wozniak", "Walt Disney", "George Lucas"]
let applicationBundle = "com.anysphere.sand"

struct Request: Decodable {
    let action: String
    let persona: String?
    let prompt: String?
}
struct Message: Codable {
    let sender: String
    let label: String
    let time: String
    let text: String
    let key: String
}
struct Snapshot: Codable {
    var ok = true
    var selectedPersona: String? = nil
    var composerHasDraft = false
    var busy = false
    var messages: [Message] = []
    var observedAt = ISO8601DateFormatter().string(from: Date())
    var error: String? = nil
}
struct BridgeError: Error { let code: String }

func normalized(_ value: String) -> String {
    value.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
}
func comparable(_ value: String) -> String {
    normalized(value).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
}
func hash(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}

final class Node {
    let element: AXUIElement?
    let role: String
    let description: String
    let title: String
    let value: String
    let domID: String
    let roleDescription: String
    let enabled: Bool
    let elementBusy: Bool
    var children: [Node]
    weak var parent: Node?

    init(element: AXUIElement? = nil, role: String = "AXGroup", description: String = "", title: String = "", value: String = "", domID: String = "", roleDescription: String = "", enabled: Bool = true, elementBusy: Bool = false, children: [Node] = []) {
        self.element = element; self.role = role; self.description = description
        self.title = title; self.value = value; self.domID = domID
        self.roleDescription = roleDescription; self.enabled = enabled
        self.elementBusy = elementBusy; self.children = children
        children.forEach { $0.parent = self }
    }
    var label: String { !description.isEmpty ? description : (!title.isEmpty ? title : value) }
    func descendants() -> [Node] { [self] + children.flatMap { $0.descendants() } }
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func stringAttribute(_ element: AXUIElement, _ name: String) -> String {
    attribute(element, name) as? String ?? ""
}
func boolAttribute(_ element: AXUIElement, _ name: String, fallback: Bool = false) -> Bool {
    (attribute(element, name) as? NSNumber)?.boolValue ?? fallback
}

final class Reader {
    var count = 0
    func read(_ element: AXUIElement, depth: Int = 0) throws -> Node {
        count += 1
        guard count <= 18000, depth <= 65 else { throw BridgeError(code: "snapshot_too_large") }
        let role = stringAttribute(element, kAXRoleAttribute)
        let node = Node(element: element, role: role,
            description: stringAttribute(element, kAXDescriptionAttribute),
            title: stringAttribute(element, kAXTitleAttribute),
            value: stringAttribute(element, kAXValueAttribute),
            domID: stringAttribute(element, "AXDOMIdentifier"),
            roleDescription: stringAttribute(element, kAXRoleDescriptionAttribute),
            enabled: boolAttribute(element, kAXEnabledAttribute, fallback: true),
            elementBusy: boolAttribute(element, "AXElementBusy"))
        var children: CFTypeRef?
        let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children)
        guard result == .success || result == .attributeUnsupported || result == .noValue else {
            throw BridgeError(code: "accessibility_read_failed")
        }
        node.children = try ((children as? [AXUIElement]) ?? []).map { try read($0, depth: depth + 1) }
        node.children.forEach { $0.parent = node }
        return node
    }
}

func dayLabel(_ text: String, observedAt: Date) -> String? {
    let clean = normalized(text)
    guard !clean.isEmpty else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let dateFormatter = DateFormatter()
    dateFormatter.locale = Locale(identifier: "en_US_POSIX")
    dateFormatter.timeZone = .current; dateFormatter.dateFormat = "yyyy-MM-dd"
    if clean.range(of: "^(Hoy|Today)(?:\\s|$)", options: [.regularExpression, .caseInsensitive]) != nil {
        return dateFormatter.string(from: observedAt)
    }
    if clean.range(of: "^(Ayer|Yesterday)(?:\\s|$)", options: [.regularExpression, .caseInsensitive]) != nil {
        return dateFormatter.string(from: calendar.date(byAdding: .day, value: -1, to: observedAt)!)
    }
    // Old transcripts may use absolute Spanish or ISO date separators.
    let withoutClock = clean.replacingOccurrences(of: "\\s+\\d{1,2}:\\d{2}(?::\\d{2})?$", with: "", options: .regularExpression)
    let parser = DateFormatter(); parser.locale = Locale(identifier: "es_ES"); parser.timeZone = .current
    parser.isLenient = false
    for format in ["yyyy-MM-dd", "d/M/yyyy", "d 'de' MMMM 'de' yyyy", "d MMM yyyy", "d MMMM yyyy"] {
        parser.dateFormat = format
        if let date = parser.date(from: withoutClock) { return dateFormatter.string(from: date) }
    }
    for format in ["d 'de' MMMM", "d MMM", "d MMMM"] {
        parser.dateFormat = format + " yyyy"
        if var date = parser.date(from: withoutClock + " " + String(calendar.component(.year, from: observedAt))) {
            if date > observedAt { date = calendar.date(byAdding: .year, value: -1, to: date)! }
            return dateFormatter.string(from: date)
        }
    }
    return nil
}

func timeParts(_ label: String) -> (String, String)? {
    let pattern = #"^(.+?)\s+([0-2]?\d:[0-5]\d(?::[0-5]\d)?)$"#
    guard let regex = try? NSRegularExpression(pattern: pattern),
          let match = regex.firstMatch(in: label, range: NSRange(label.startIndex..., in: label)),
          let nameRange = Range(match.range(at: 1), in: label),
          let timeRange = Range(match.range(at: 2), in: label) else { return nil }
    return (String(label[nameRange]), String(label[timeRange]))
}

func messageTimestamp(day: String, time: String) -> String {
    guard day != "undated" else { return time }
    let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX")
    parser.timeZone = .current; parser.isLenient = false
    parser.dateFormat = time.split(separator: ":").count == 3 ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm"
    guard let date = parser.date(from: day + " " + time) else { return day + " " + time }
    let iso = ISO8601DateFormatter(); iso.timeZone = .current
    return iso.string(from: date)
}

func messageText(_ node: Node) -> String {
    if node.domID.hasSuffix("-timestamp") { return "" }
    if node.role == "AXStaticText" || node.role == "AXListMarker" {
        return node.value.isEmpty ? node.title : node.value
    }
    if node.children.isEmpty {
        if ["AXLink", "AXHeading", "AXButton"].contains(node.role) { return node.label }
        if node.role == "AXImage", !node.label.isEmpty { return "[" + node.label + "]" }
        return ""
    }
    let blocks = ["AXParagraph", "AXHeading", "AXList", "AXListItem", "AXRow", "AXBlockQuote"]
    var result = ""
    for child in node.children {
        let text = messageText(child)
        guard !text.isEmpty else { continue }
        let block = blocks.contains(child.role) || ["párrafo", "paragraph", "elemento de lista", "list item"].contains(child.roleDescription.lowercased())
        if block, !result.isEmpty, !result.hasSuffix("\n") { result += "\n" }
        result += text
        if block, !result.hasSuffix("\n") { result += "\n" }
    }
    return result
}

func parseMessages(_ transcript: Node, persona: String, observedAt: Date = Date()) -> [Message] {
    var result: [Message] = [], day = "undated"
    func visit(_ node: Node) {
        if node.role == "AXTextArea" { return } // Composer is inside the log in Grok Bot.
        if node.role == "AXStaticText", let date = dayLabel(node.value, observedAt: observedAt) { day = date; return }
        if node.role == "AXGroup", let (label, time) = timeParts(node.title) {
            let sender: String
            if ["Tú", "You"].contains(label) { sender = "user" }
            else if label == persona { sender = "assistant" }
            else if label.hasPrefix("Le escribió a ") || label.hasPrefix("Mensaje de ") || label.hasPrefix("Wrote to ") || label.hasPrefix("Message from ") { sender = "event" }
            else { node.children.forEach(visit); return }
            let contentLabel = sender == "user" ? "Tu mensaje" : "Mensaje de " + persona
            let content = node.descendants().first { $0.description == contentLabel } ?? node
            let text = normalized(messageText(content))
            // Do not hash the streaming text: updating an answer must update its
            // existing row. Day+native card label+time survive viewport changes.
            let identity = [persona, sender, day, label, time].joined(separator: "\u{0}")
            result.append(Message(sender: sender, label: label, time: messageTimestamp(day: day, time: time), text: text, key: "ax_" + hash(identity)))
            return
        }
        node.children.forEach(visit)
    }
    visit(transcript)
    return result
}

func hasDraft(value: String, persona: String, sendEnabled: Bool) -> Bool {
    let content = normalized(value)
    // Chromium exposes the editor's placeholder as AXValue and character count.
    // It is empty only when the exact placeholder AND absent/disabled Send agree.
    let placeholders = ["Escríbele a " + persona, "Message " + persona]
    if content.isEmpty { return sendEnabled } // Includes attachment-only drafts.
    return !(placeholders.contains(content) && !sendEnabled)
}

struct Context {
    let root: Node
    let heading: Node
    let pane: Node
    let transcript: Node
    let composer: Node
    let sendButton: Node?
    let snapshot: Snapshot
}

final class GrokAX {
    let app: AXUIElement
    init() throws {
        guard AXIsProcessTrusted() else { throw BridgeError(code: "accessibility_required") }
        let matches = NSWorkspace.shared.runningApplications.filter { $0.bundleIdentifier == applicationBundle }
        guard matches.count == 1, let running = matches.first else { throw BridgeError(code: matches.isEmpty ? "application_not_running" : "application_ambiguous") }
        app = AXUIElementCreateApplication(running.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 1.5)
    }
    func read() throws -> Context {
        let windows = (attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
        let candidates = windows.filter { stringAttribute($0, kAXTitleAttribute) == "Grok Bot" }
        guard candidates.count == 1, let window = candidates.first else { throw BridgeError(code: "conversation_window_unavailable") }
        let tree = try Reader().read(window)
        let headings = tree.descendants().filter { $0.role == "AXHeading" && $0.domID == "sand-conversation-heading" }
        guard headings.count == 1, let heading = headings.first, supportedPersonas.contains(heading.label) else { throw BridgeError(code: "unsupported_or_ambiguous_conversation") }
        let persona = heading.label
        var candidate: Node? = heading.parent, pane: Node? = nil
        while let node = candidate {
            let all = node.descendants()
            if all.contains(where: { $0.description == "Transcripción de la conversación" }) && all.contains(where: { $0.role == "AXTextArea" && $0.description == "Prompt" }) { pane = node; break }
            candidate = node.parent
        }
        guard let pane = pane else { throw BridgeError(code: "conversation_structure_unavailable") }
        let nodes = pane.descendants()
        let transcripts = nodes.filter { $0.role == "AXGroup" && $0.description == "Transcripción de la conversación" }
        let composers = nodes.filter { $0.role == "AXTextArea" && $0.description == "Prompt" }
        guard transcripts.count == 1, composers.count == 1 else { throw BridgeError(code: "conversation_structure_ambiguous") }
        let transcript = transcripts[0], composer = composers[0]
        let sends = nodes.filter { $0.role == "AXButton" && $0.label == "Enviar mensaje" }
        guard sends.count <= 1 else { throw BridgeError(code: "send_button_ambiguous") }
        let send = sends.first
        let stopLabels = ["Detener respuesta", "Detener generación", "Detener", "Stop generating", "Stop response"]
        let busy = pane.elementBusy || transcript.elementBusy || nodes.contains { $0.role == "AXButton" && $0.enabled && stopLabels.contains($0.label) }
        var snapshot = Snapshot()
        snapshot.selectedPersona = persona
        snapshot.composerHasDraft = hasDraft(value: composer.value, persona: persona, sendEnabled: send?.enabled == true)
        snapshot.busy = busy
        snapshot.messages = parseMessages(transcript, persona: persona)
        guard let liveHeading = heading.element, stringAttribute(liveHeading, kAXDescriptionAttribute) == persona else { throw BridgeError(code: "selection_changed_during_snapshot") }
        return Context(root: tree, heading: heading, pane: pane, transcript: transcript, composer: composer, sendButton: send, snapshot: snapshot)
    }
    func select(_ persona: String) throws -> Snapshot {
        let initial = try read()
        if initial.snapshot.selectedPersona == persona { return initial.snapshot }
        guard !initial.snapshot.composerHasDraft else { return failed(initial.snapshot, "draft_exists") }
        let lists = initial.root.descendants().filter { $0.role == "AXGroup" && $0.description == "Lista de Bots" }
        guard lists.count == 1 else { return failed(initial.snapshot, "bot_list_unavailable") }
        let buttons = lists[0].descendants().filter { $0.role == "AXButton" && $0.label == persona && $0.enabled }
        guard buttons.count == 1, let button = buttons[0].element else { return failed(initial.snapshot, "bot_button_unavailable") }
        // Check the live editor immediately before changing the conversation.
        guard let composer = initial.composer.element,
              !hasDraft(value: stringAttribute(composer, kAXValueAttribute), persona: initial.snapshot.selectedPersona!, sendEnabled: initial.sendButton?.enabled == true) else { return failed(initial.snapshot, "draft_exists") }
        let press = AXUIElementPerformAction(button, kAXPressAction as CFString)
        guard press == .success else { return failed((try? read().snapshot) ?? initial.snapshot, "selection_unconfirmed") }
        let deadline = Date().addingTimeInterval(4)
        var latest = initial.snapshot
        repeat {
            Thread.sleep(forTimeInterval: 0.12)
            if let current = try? read() {
                latest = current.snapshot
                if current.snapshot.selectedPersona == persona { return latest }
            }
        } while Date() < deadline
        return failed(latest, "selection_unconfirmed")
    }
    func send(_ persona: String, prompt: String) throws -> Snapshot {
        let initial = try read()
        guard initial.snapshot.selectedPersona == persona else { return failed(initial.snapshot, "persona_not_selected") }
        guard !initial.snapshot.composerHasDraft else { return failed(initial.snapshot, "draft_exists") }
        guard !initial.snapshot.busy else { return failed(initial.snapshot, "conversation_busy") }
        guard let composer = initial.composer.element else { return failed(initial.snapshot, "composer_unavailable") }
        var settable: DarwinBoolean = false
        guard AXUIElementIsAttributeSettable(composer, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else { return failed(initial.snapshot, "composer_not_writable") }
        guard let heading = initial.heading.element, stringAttribute(heading, kAXDescriptionAttribute) == persona,
              !hasDraft(value: stringAttribute(composer, kAXValueAttribute), persona: persona, sendEnabled: initial.sendButton?.enabled == true) else { return failed(initial.snapshot, "selection_or_draft_changed") }
        let before = Set(initial.snapshot.messages.filter { $0.sender == "user" }.map { $0.key })
        let write = AXUIElementSetAttributeValue(composer, kAXValueAttribute as CFString, prompt as CFString)
        guard write == .success else { return failed((try? read().snapshot) ?? initial.snapshot, "unknown") }
        var ready: Context? = nil
        var latest = initial.snapshot
        let composeDeadline = Date().addingTimeInterval(3)
        repeat {
            Thread.sleep(forTimeInterval: 0.1)
            if let current = try? read() {
                latest = current.snapshot
                guard current.snapshot.selectedPersona == persona else { return failed(latest, "unknown") }
                if comparable(current.composer.value) == comparable(prompt), current.sendButton?.enabled == true { ready = current; break }
            }
        } while Date() < composeDeadline
        guard let current = ready, let send = current.sendButton?.element, let currentComposer = current.composer.element,
              let currentHeading = current.heading.element,
              stringAttribute(currentHeading, kAXDescriptionAttribute) == persona,
              comparable(stringAttribute(currentComposer, kAXValueAttribute)) == comparable(prompt) else { return failed(latest, "unknown") }
        // Exactly one press. Never retry after an AX error or ambiguous result.
        let press = AXUIElementPerformAction(send, kAXPressAction as CFString)
        guard press == .success else { return failed((try? read().snapshot) ?? latest, "unknown") }
        let deadline = Date().addingTimeInterval(8)
        repeat {
            Thread.sleep(forTimeInterval: 0.15)
            if let after = try? read() {
                latest = after.snapshot
                guard latest.selectedPersona == persona else { return failed(latest, "unknown") }
                if latest.messages.contains(where: { $0.sender == "user" && !before.contains($0.key) && comparable($0.text) == comparable(prompt) }) { return latest }
            }
        } while Date() < deadline
        return failed(latest, "unknown")
    }
}

func failed(_ snapshot: Snapshot, _ code: String) -> Snapshot {
    var result = snapshot; result.ok = false; result.error = code
    result.observedAt = ISO8601DateFormatter().string(from: Date())
    return result
}

final class MutationLock {
    let fd: Int32
    init() throws {
        let path = "/tmp/admira-grokbot-ax-\(getuid()).lock"
        fd = Darwin.open(path, O_WRONLY | O_CREAT | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw BridgeError(code: "bridge_lock_unavailable") }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_uid == getuid(), (info.st_mode & S_IFMT) == S_IFREG, (info.st_mode & 0o077) == 0 else {
            Darwin.close(fd); throw BridgeError(code: "bridge_lock_unavailable")
        }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { Darwin.close(fd); throw BridgeError(code: "bridge_busy") }
    }
    deinit { flock(fd, LOCK_UN); Darwin.close(fd) }
}

func selfTests() throws {
    func expect(_ condition: @autoclosure () -> Bool, _ detail: String) throws { if !condition() { throw BridgeError(code: "self_test_failed: " + detail) } }
    let yesterday = Node(role: "AXStaticText", value: "Ayer 23:18")
    let at = ISO8601DateFormatter().date(from: "2026-09-18T10:00:00Z")!
    func card(_ title: String, _ description: String, _ text: String) -> Node {
        Node(title: title, children: [Node(description: description, children: [Node(role: "AXStaticText", value: text)]), Node(description: "23:18:02", domID: "message-timestamp", children: [Node(role: "AXStaticText", value: "23:18")])])
    }
    let prompt = card("Tú 23:18:02", "Tu mensaje", "Pregunta literal <script>alert(1)</script>")
    let answer = card("Steve Jobs 23:18:18", "Mensaje de Steve Jobs", "Respuesta")
    let event = Node(title: "Le escribió a George Lucas 23:18:43", children: [Node(role: "AXStaticText", value: "Escribió a "), Node(role: "AXButton", description: "Abrir intercambio con George Lucas")])
    let transcript = Node(description: "Transcripción de la conversación", children: [yesterday, prompt, answer, event, Node(role: "AXTextArea", description: "Prompt", value: "draft")])
    let parsed = parseMessages(transcript, persona: "Steve Jobs", observedAt: at)
    try expect(parsed.count == 3, "only conversation cards")
    try expect(parsed.map { $0.sender } == ["user", "assistant", "event"], "sender attribution")
    try expect(parsed[0].text == "Pregunta literal <script>alert(1)</script>", "literal text, no timestamp or composer")
    try expect(parsed[0].time == messageTimestamp(day: "2026-09-17", time: "23:18:02") && parsed[0].time.contains("T23:18:02"), "relative day normalized to ISO")
    answer.children[0].children = [Node(role: "AXStaticText", value: "Respuesta que sigue creciendo")]
    let streaming = parseMessages(transcript, persona: "Steve Jobs", observedAt: at)
    try expect(streaming[1].key == parsed[1].key && streaming[1].text != parsed[1].text, "streaming updates same key")
    transcript.children.remove(at: 1)
    try expect(parseMessages(transcript, persona: "Steve Jobs", observedAt: at)[0].key == parsed[1].key, "viewport index independent")
    try expect(!hasDraft(value: "Escríbele a Steve Jobs\n", persona: "Steve Jobs", sendEnabled: false), "native placeholder is empty")
    try expect(hasDraft(value: "Escríbele a Steve Jobs\n", persona: "Steve Jobs", sendEnabled: true), "identical literal draft is protected")
    try expect(hasDraft(value: "Mi borrador", persona: "Steve Jobs", sendEnabled: false), "nonempty draft protected")
    try expect(hasDraft(value: "", persona: "Steve Jobs", sendEnabled: true), "attachment-only draft protected")
    print("{\"ok\":true,\"tests\":10,\"mode\":\"pure-parsing-no-AX\"}")
}

do {
    if CommandLine.arguments.contains("--self-test") { try selfTests(); exit(0) }
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 100000 else { throw BridgeError(code: "request_too_large") }
    let request: Request
    do { request = try JSONDecoder().decode(Request.self, from: data) }
    catch { throw BridgeError(code: "invalid_request") }
    guard ["snapshot", "select", "send"].contains(request.action) else { throw BridgeError(code: "unsupported_action") }
    if request.action != "snapshot" {
        guard let persona = request.persona, supportedPersonas.contains(persona) else { throw BridgeError(code: "unsupported_persona") }
    }
    let bridge = try GrokAX()
    let snapshot: Snapshot
    if request.action == "snapshot" {
        snapshot = try bridge.read().snapshot // No selection, focus, or AX mutation.
    } else {
        let lock = try MutationLock()
        defer { withExtendedLifetime(lock) {} }
        if request.action == "select" { snapshot = try bridge.select(request.persona!) }
        else {
            guard let prompt = request.prompt, !normalized(prompt).isEmpty, prompt.count <= 16000 else { throw BridgeError(code: "invalid_prompt") }
            snapshot = try bridge.send(request.persona!, prompt: prompt)
        }
    }
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    FileHandle.standardOutput.write(try encoder.encode(snapshot)); FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    var failure = Snapshot(); failure.ok = false
    failure.error = (error as? BridgeError)?.code ?? "accessibility_unavailable"
    failure.busy = failure.error == "bridge_busy"
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(failure) { FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data("\n".utf8)) }
    exit(1)
}
