// Local macOS Accessibility bridge. One JSON request per process, stdout JSON.
// No Apple Events, private web APIs, browser debugging, tokens, window movement
// or permission prompts. Explicit controls perform bounded AX/input actions.
import Cocoa
import ApplicationServices
import CryptoKit
import ScreenCaptureKit
import Darwin

let supportedPersonas = ["Steve Jobs", "Steve Wozniak", "Walt Disney", "George Lucas"]
let applicationBundle = "com.anysphere.sand"

struct Request: Decodable {
    let action: String
    let persona: String?
    let prompt: String?
    let routineID: String?
    let revision: String?
    let paused: Bool?
    let runKey: String?
    let attachmentPaths: [String]?
    let remoteTarget: RemoteTarget?
    let remoteEvent: RemoteInput?
}
struct Message: Codable {
    let sender: String
    let label: String
    let time: String
    let text: String
    let key: String
    var legacyKey: String? = nil
}
struct Routine: Codable {
    let id: String
    let name: String
    let schedule: String
}
struct RoutineDetail: Codable {
    let id: String
    let name: String
    let instruction: String
    let paused: Bool
    let revision: String
}
func routineItems(_ root: Node, persona: String) -> [Routine]? {
    let lists = root.descendants().filter { $0.label == "Rutinas" && $0.role != "AXStaticText" }
    guard lists.count == 1 else { return nil }
    return lists[0].descendants().filter { $0.role == "AXButton" }.compactMap { button in
        let texts = button.descendants().filter { $0.role == "AXStaticText" }.map { $0.label }.filter { !$0.isEmpty }
        guard let name = texts.first else { return nil }
        return Routine(id: hash(persona + "\0" + name), name: name, schedule: texts.dropFirst().joined(separator: " "))
    }
}
struct Snapshot: Codable {
    var protocolVersion = 3
    var routines: [Routine]? = nil
    var routine: RoutineDetail? = nil
    var runKey: String? = nil
    var ok = true
    var selectedPersona: String? = nil
    var composerHasDraft = false
    var busy = false
    var messages: [Message] = []
    var observedAt = ISO8601DateFormatter().string(from: Date())
    var error: String? = nil
}
struct BridgeError: Error { let code: String; var diagnostics: [String:Double]? = nil }

func normalized(_ value: String) -> String {
    value.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
}
func comparable(_ value: String) -> String {
    normalized(value).split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
}
func hash(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}
// La barra lateral cuelga el estado del nombre accesible del bot: "Steve Wozniak,
// Actividad no leida", "Walt Disney, Trabajando". Comparando por igualdad exacta el
// puente se quedaba sin poder abrir a un consejero justo cuando acababa de contestar
// —que es cuando mas falta hace— y devolvia bot_button_unavailable. Se acepta el
// nombre a secas o el nombre seguido de coma y su estado; exigir la coma evita
// confundir a dos bots cuyo nombre empiece igual.
func esElBot(_ etiqueta: String, _ persona: String) -> Bool {
    let e = comparable(etiqueta), p = comparable(persona)
    return e == p || e.hasPrefix(p + ", ")
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
            domID: stringAttribute(element, "AXDOMIdentifier").isEmpty ? stringAttribute(element, kAXIdentifierAttribute) : stringAttribute(element, "AXDOMIdentifier"),
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
            let legacyKey = "ax_" + hash(identity)
            let nativeIDs = node.descendants().map { $0.domID }.filter { $0.hasPrefix("sand-") && $0.contains("-entry-") && $0.hasSuffix("-timestamp") }
            let nativeID = Set(nativeIDs).count == 1 ? nativeIDs.first : nil
            // GrokBot's timestamp DOM id contains its persistent entry id. It
            // separates two messages in the same minute without hashing text.
            let key = nativeID.map { "ax_" + hash(persona + "\0" + $0) } ?? legacyKey
            result.append(Message(sender: sender, label: label, time: messageTimestamp(day: day, time: time), text: text, key: key, legacyKey: key == legacyKey ? nil : legacyKey))
            return
        }
        node.children.forEach(visit)
    }
    visit(transcript)
    return result
}

// Chromium expone a veces el PLACEHOLDER del editor como AXValue en vez del
// texto escrito —hasDraft ya lo contempla—, asi que exigir que el compositor
// relea exactamente el prompt hacia el envio IMPOSIBLE: tras escribir, el valor
// leido era "Escribele a <persona>" y la condicion no se cumplia nunca. El
// bucle agotaba sus 3 s y devolvia "unknown", que en la interfaz sale como
// "Envio sin confirmar" con el texto esperando en el compositor.
// Se acepta tambien ese caso, pero SOLO si el boton de enviar esta disponible:
// ese boton no existe mientras el compositor esta vacio, asi que su presencia
// es la prueba de que la app si tiene el texto.
func compositorListo(valor: String, prompt: String, persona: String, envioDisponible: Bool, ownAttachment: Bool = false) -> Bool {
    // AXValue updates before Electron enables Send. Text equality alone is not
    // readiness: AXPress can succeed on a disabled control without submitting.
    guard envioDisponible else { return false }
    if comparable(valor) == comparable(prompt) { return true }
    let contenido = normalized(valor)
    let marcadores = ["Escríbele a " + persona, "Message " + persona] + (ownAttachment ? ["Agrega un mensaje o presiona enviar."] : [])
    return contenido.isEmpty || marcadores.contains(contenido)
}

func hasDraft(value: String, persona: String, sendEnabled: Bool) -> Bool {
    let content = normalized(value)
    // Chromium exposes the editor's placeholder as AXValue and character count.
    // It is empty only when the exact placeholder AND absent/disabled Send agree.
    let placeholders = ["Escríbele a " + persona, "Message " + persona]
    if content.isEmpty { return sendEnabled } // Includes attachment-only drafts.
    return !(placeholders.contains(content) && !sendEnabled)
}

// Clave estable de un boton dentro de una misma ventana: etiqueta + orden de
// aparicion. Sirve para comparar dos lecturas seguidas del mismo arbol.
func botonClave(_ n: Node, _ vistos: inout [String: Int]) -> String {
    let base = n.label
    let i = vistos[base] ?? 0
    vistos[base] = i + 1
    return base + "#" + String(i)
}

func botonesHabilitados(_ nodes: [Node]) -> Set<String> {
    var vistos: [String: Int] = [:]
    var out = Set<String>()
    for n in nodes where n.role == "AXButton" {
        let k = botonClave(n, &vistos)
        if n.enabled { out.insert(k) }
    }
    return out
}

// El boton de enviar es el UNICO que pasa de apagado a encendido cuando el
// compositor tiene texto. Identificarlo asi —y no por una etiqueta fija— es lo
// que evita que una actualizacion de la app vuelva a romper el envio: el 19-sep
// Grok Bot 0.57.1 renombro "Enviar mensaje" y el puente, compilado el 18, dejo
// de encontrarlo; escribia el texto y no pulsaba nunca.
// Si aparece mas de uno NO se pulsa nada: es preferible no enviar que pulsar
// "entrada de voz" o "nuevo chat".
func botonQueSeEnciende(antes: Set<String>, ahora nodes: [Node]) -> Node? {
    var vistos: [String: Int] = [:]
    var nuevos: [Node] = []
    for n in nodes where n.role == "AXButton" {
        let k = botonClave(n, &vistos)
        if n.enabled && !antes.contains(k) { nuevos.append(n) }
    }
    return nuevos.count == 1 ? nuevos[0] : nil
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
        snapshot.routines = routineItems(tree, persona: persona)
        snapshot.runKey = snapshot.messages.last(where: { $0.sender == "user" })?.key
        guard let liveHeading = heading.element, stringAttribute(liveHeading, kAXDescriptionAttribute) == persona else { throw BridgeError(code: "selection_changed_during_snapshot") }
        return Context(root: tree, heading: heading, pane: pane, transcript: transcript, composer: composer, sendButton: send, snapshot: snapshot)
    }
    // Explicit selection/send needs an active Electron window. Passive reads
    // never call this helper. Restore focus without changing window geometry.
    func activateForInteraction() throws -> () -> Void {
        let previous = NSWorkspace.shared.frontmostApplication
        var pid: pid_t = 0
        guard AXUIElementGetPid(app, &pid) == .success,
              let native = NSRunningApplication(processIdentifier: pid) else { throw BridgeError(code: "interaction_focus_unavailable") }
        let windows = (attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
        let targets = windows.filter { stringAttribute($0, kAXTitleAttribute) == "Grok Bot" }
        guard targets.count == 1 else { throw BridgeError(code: "interaction_focus_unavailable") }
        let restore: () -> Void = {
            if let previous = previous, previous.processIdentifier != pid,
               NSWorkspace.shared.frontmostApplication?.processIdentifier == pid {
                _ = AXUIElementSetAttributeValue(AXUIElementCreateApplication(previous.processIdentifier), kAXFrontmostAttribute as CFString, kCFBooleanTrue)
                previous.activate(options: [])
            }
        }
        _ = AXUIElementSetAttributeValue(app, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
        _ = native.activate(options: [])
        guard AXUIElementPerformAction(targets[0], kAXRaiseAction as CFString) == .success else { restore(); throw BridgeError(code: "interaction_focus_unavailable") }
        let focusDeadline = Date().addingTimeInterval(2)
        while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date() < focusDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        return restore
    }
    func select(_ persona: String) throws -> Snapshot {
        var initial = try read()
        if initial.snapshot.selectedPersona == persona { return initial.snapshot }
        guard !initial.snapshot.composerHasDraft else { return failed(initial.snapshot, "draft_exists") }
        let restore = try activateForInteraction()
        defer { restore() }
        initial = try read()
        if initial.snapshot.selectedPersona == persona { return initial.snapshot }
        guard !initial.snapshot.composerHasDraft else { return failed(initial.snapshot, "draft_exists") }
        let lists = initial.root.descendants().filter { $0.role == "AXGroup" && $0.description == "Lista de Bots" }
        guard lists.count == 1 else { return failed(initial.snapshot, "bot_list_unavailable") }
        let buttons = lists[0].descendants().filter { $0.role == "AXButton" && esElBot($0.label, persona) && $0.enabled }
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
    func press(_ node: Node) throws {
        guard node.enabled, let el = node.element,
              AXUIElementPerformAction(el, kAXPressAction as CFString) == .success else { throw BridgeError(code: "control_unavailable") }
    }
    func routineList(_ persona: String) throws -> Context {
        var ctx = try read()
        guard ctx.snapshot.selectedPersona == persona else { throw BridgeError(code: "persona_not_selected") }
        if ctx.snapshot.routines != nil { return ctx }
        if let back = ctx.root.descendants().first(where: { $0.role == "AXButton" && ["Volver a Rutinas", "Volver a los detalles"].contains($0.label) }) {
            try press(back)
        } else {
            let buttons = ctx.pane.descendants().filter { $0.role == "AXButton" && $0.label == "Ver detalles de la conversación" }
            guard buttons.count == 1 else { throw BridgeError(code: "routine_controls_unavailable") }
            try press(buttons[0])
        }
        let deadline = Date().addingTimeInterval(3)
        repeat {
            Thread.sleep(forTimeInterval: 0.1); ctx = try read()
            guard ctx.snapshot.selectedPersona == persona else { throw BridgeError(code: "persona_not_selected") }
            if ctx.snapshot.routines != nil { return ctx }
        } while Date() < deadline
        throw BridgeError(code: "routine_controls_unavailable")
    }
    func routine(_ persona: String, id: String, paused: Bool?, revision: String?) throws -> Snapshot {
        let ctx = try routineList(persona)
        guard let item = ctx.snapshot.routines?.first(where: { $0.id == id }) else { throw BridgeError(code: "routine_not_found") }
        let cards = ctx.root.descendants().filter { $0.role == "AXButton" && $0.descendants().contains(where: { $0.role == "AXStaticText" && $0.label == item.name }) }
        guard cards.count == 1 else { throw BridgeError(code: "routine_controls_unavailable") }
        try press(cards[0])
        func detail() throws -> (Context, RoutineDetail, Node) {
            let current = try read()
            guard current.snapshot.selectedPersona == persona else { throw BridgeError(code: "persona_not_selected") }
            let panels = current.root.descendants().filter { $0.label == item.name && $0.role == "AXGroup" }
            guard panels.count == 1 else { throw BridgeError(code: "routine_controls_unavailable") }
            let nodes = panels[0].descendants()
            let toggles = nodes.filter { $0.role == "AXButton" && ["Pausar", "Reanudar"].contains($0.label) }
            guard toggles.count == 1 else { throw BridgeError(code: "routine_controls_unavailable") }
            let instruction = nodes.filter { $0.role == "AXStaticText" }.map { $0.label }.joined(separator: "\n")
            let off = toggles[0].label == "Reanudar"
            let detail = RoutineDetail(id: id, name: item.name, instruction: instruction, paused: off, revision: hash(persona + "\0" + id + "\0" + instruction + "\0" + String(off)))
            return (current, detail, toggles[0])
        }
        let detailDeadline = Date().addingTimeInterval(3)
        var loaded: (Context, RoutineDetail, Node)? = nil
        repeat {
            Thread.sleep(forTimeInterval: 0.1)
            do { loaded = try detail() } catch let error as BridgeError {
                if error.code == "persona_not_selected" { throw error }
            }
        } while loaded == nil && Date() < detailDeadline
        guard var (current, info, control) = loaded else { throw BridgeError(code: "routine_controls_unavailable") }
        if let desired = paused {
            if info.paused != desired {
                guard revision == info.revision else { throw BridgeError(code: "routine_changed") }
                try press(control) // Explicit desired state, never a blind toggle/retry.
                Thread.sleep(forTimeInterval: 0.25)
                (current, info, control) = try detail()
                guard info.paused == desired else { throw BridgeError(code: "routine_state_unconfirmed") }
            }
        }
        var result = current.snapshot; result.routine = info
        return result
    }
    func interrupt(_ persona: String, runKey: String) throws -> Snapshot {
        let ctx = try read()
        guard ctx.snapshot.selectedPersona == persona else { return failed(ctx.snapshot, "persona_not_selected") }
        guard ctx.snapshot.runKey == runKey else { return failed(ctx.snapshot, "run_changed") }
        if !ctx.snapshot.busy { return ctx.snapshot }
        let controls = ctx.pane.descendants().filter { $0.role == "AXButton" && $0.enabled && ["Detener respuesta", "Detener generación", "Detener", "Stop generating", "Stop response"].contains($0.label) }
        guard controls.count == 1 else { return failed(ctx.snapshot, "control_unavailable") }
        try press(controls[0])
        Thread.sleep(forTimeInterval: 0.2)
        return try read().snapshot
    }
    func findDialogControl(_ predicate: (Node) -> Bool) -> Node? {
        // Native Open panels contain lazily populated file lists. Read shallow
        // controls breadth-first so an unreadable file row cannot discard the
        // whole sheet or hide its path field and Open button.
        var queue = (attribute(app, kAXWindowsAttribute) as? [AXUIElement]) ?? []
        if let focused = attribute(app, kAXFocusedWindowAttribute), CFGetTypeID(focused) == AXUIElementGetTypeID() { queue.insert(unsafeBitCast(focused, to: AXUIElement.self), at: 0) }
        var visited: [CFHashCode:[AXUIElement]] = [:], index = 0
        var match: Node? = nil
        while index < queue.count && index < 4000 {
            let element = queue[index]; index += 1
            let hashCode = CFHash(element)
            if (visited[hashCode] ?? []).contains(where: { CFEqual($0,element) }) { continue }
            visited[hashCode,default:[]].append(element)
            let dom = stringAttribute(element, "AXDOMIdentifier")
            let node = Node(element:element, role:stringAttribute(element,kAXRoleAttribute), description:stringAttribute(element,kAXDescriptionAttribute), title:stringAttribute(element,kAXTitleAttribute), value:stringAttribute(element,kAXValueAttribute), domID:dom.isEmpty ? stringAttribute(element,kAXIdentifierAttribute) : dom, enabled:boolAttribute(element,kAXEnabledAttribute,fallback:true))
            if predicate(node) {
                guard match == nil else { return nil }
                match = node
            }
            queue.append(contentsOf:(attribute(element,kAXChildrenAttribute) as? [AXUIElement]) ?? [])
            queue.append(contentsOf:(attribute(element,"AXSheets") as? [AXUIElement]) ?? [])
        }
        // Refuse ambiguous controls or a truncated traversal.
        return index == queue.count ? match : nil
    }
    func waitNode(_ step: String, _ predicate: (Node) -> Bool) throws -> Node {
        let until = Date().addingTimeInterval(5)
        repeat {
            if let node = findDialogControl(predicate) { return node }
            Thread.sleep(forTimeInterval: 0.1)
        } while Date() < until
        throw BridgeError(code: "attachment_" + step + "_unavailable")
    }
    var keyFlags: CGEventFlags = []
    func key(_ code: CGKeyCode, down: Bool) throws {
        var pid: pid_t = 0
        guard AXUIElementGetPid(app, &pid) == .success, pid > 0,
              let event = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down) else { throw BridgeError(code: "attachment_control_unavailable") }
        if code == 55 { if down { keyFlags.insert(.maskCommand) } else { keyFlags.remove(.maskCommand) } }
        if code == 56 { if down { keyFlags.insert(.maskShift) } else { keyFlags.remove(.maskShift) } }
        event.flags = keyFlags
        event.postToPid(pid) // Application target only, never global keyboard injection.
    }
    func attach(_ persona: String, file: String) throws {
        let base = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".fleet/grokbot-uploads").path + "/"
        let url = URL(fileURLWithPath: file)
        guard file.hasPrefix(base), url.standardizedFileURL.path == file,
              url.resolvingSymlinksInPath().path == file,
              let attrs = try? FileManager.default.attributesOfItem(atPath: file),
              attrs[.type] as? FileAttributeType == .typeRegular,
              (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              ((attrs[.posixPermissions] as? NSNumber)?.intValue ?? 0777) & 0077 == 0 else { throw BridgeError(code: "invalid_attachment_path") }
        let initial = try read()
        guard initial.snapshot.selectedPersona == persona, !initial.snapshot.composerHasDraft, !initial.snapshot.busy else { throw BridgeError(code: "selection_or_draft_changed") }
        let restore = try activateForInteraction()
        defer { restore() }
        let controls = initial.pane.descendants().filter { ["AXButton", "AXPopUpButton", "AXMenuButton"].contains($0.role) && $0.label == "Adjuntar archivo" }
        guard controls.count == 1 else { throw BridgeError(code: "attachment_button_unavailable") }
        try press(controls[0])
        let attachItem = try waitNode("menu") { $0.label == "Adjuntar archivos" && $0.role != "AXStaticText" }
        try press(attachItem)
        _ = try waitNode("picker") { $0.domID == "open-panel" || ($0.role == "AXSheet" && ["abrir","open"].contains($0.label.lowercased())) }
        // Target this application, never the foreground app. Release modifiers
        // on every path; all subsequent actions are on the verified native panel.
        try key(55, down: true); try key(56, down: true)
        defer { try? key(56, down: false); try? key(55, down: false) }
        try key(5, down: true); try key(5, down: false)
        try key(56, down: false); try key(55, down: false)
        let pathField = try waitNode("path") { $0.domID == "PathTextField" }
        guard let el=pathField.element, AXUIElementSetAttributeValue(el,kAXValueAttribute as CFString,file as CFString) == .success else { throw BridgeError(code: "attachment_control_unavailable") }
        try key(36, down: true); try key(36, down: false)
        let open = try waitNode("open") { $0.domID == "OKButton" && $0.enabled }
        try press(open)
        let until = Date().addingTimeInterval(8)
        repeat {
            Thread.sleep(forTimeInterval: 0.15)
            guard let ctx=try? read() else { continue }
            guard ctx.snapshot.selectedPersona == persona else { throw BridgeError(code: "selection_or_draft_changed") }
            if ctx.pane.descendants().contains(where: { $0.role == "AXButton" && $0.label == "Quitar " + url.lastPathComponent }) && ctx.sendButton?.enabled == true { return }
        } while Date() < until
        throw BridgeError(code: "attachment_unconfirmed")
    }
    func send(_ persona: String, prompt: String, attachmentPaths: [String] = []) throws -> Snapshot {
        guard attachmentPaths.count <= 1 else { throw BridgeError(code: "invalid_attachment_path") }
        let restore = try activateForInteraction()
        defer { restore() }
        for file in attachmentPaths {
            do { try attach(persona, file: file) }
            catch let error as BridgeError {
                if error.code.hasPrefix("attachment_") || error.code == "invalid_attachment_path" { throw error }
                throw BridgeError(code:"attachment_prepare_failed")
            } catch { throw BridgeError(code:"attachment_prepare_failed") }
        }
        let initial = try read()
        let ownAttachment = attachmentPaths.count == 1 && initial.pane.descendants().filter { $0.role == "AXButton" && $0.label.hasPrefix("Quitar ") }.map { $0.label } == attachmentPaths.map { "Quitar " + URL(fileURLWithPath: $0).lastPathComponent } && comparable(initial.composer.value) == "Agrega un mensaje o presiona enviar."
        guard initial.snapshot.selectedPersona == persona else { return failed(initial.snapshot, "persona_not_selected") }
        guard !initial.snapshot.composerHasDraft || ownAttachment else { return failed(initial.snapshot, "draft_exists") }
        guard !initial.snapshot.busy else { return failed(initial.snapshot, "conversation_busy") }
        guard let composer = initial.composer.element else { return failed(initial.snapshot, "composer_unavailable") }
        var settable: DarwinBoolean = false
        guard AXUIElementIsAttributeSettable(composer, kAXValueAttribute as CFString, &settable) == .success, settable.boolValue else { return failed(initial.snapshot, "composer_not_writable") }
        guard let heading = initial.heading.element, stringAttribute(heading, kAXDescriptionAttribute) == persona,
              (!hasDraft(value: stringAttribute(composer, kAXValueAttribute), persona: persona, sendEnabled: initial.sendButton?.enabled == true) || (ownAttachment && comparable(stringAttribute(composer, kAXValueAttribute)) == "Agrega un mensaje o presiona enviar.")) else { return failed(initial.snapshot, "selection_or_draft_changed") }
        let before = Set(initial.snapshot.messages.filter { $0.sender == "user" }.map { $0.key })
        let botonesAntes = botonesHabilitados(initial.pane.descendants())
        // Setting AXValue does not focus the contenteditable. Focus the exact
        // composer first so Electron commits input before the Send action.
        guard AXUIElementSetAttributeValue(composer, kAXFocusedAttribute as CFString, kCFBooleanTrue) == .success else { return failed(initial.snapshot, "interaction_focus_unavailable") }
        let write = AXUIElementSetAttributeValue(composer, kAXValueAttribute as CFString, prompt as CFString)
        guard write == .success else { return failed((try? read().snapshot) ?? initial.snapshot, "unknown") }
        var ready: Context? = nil
        var latest = initial.snapshot
        let composeDeadline = Date().addingTimeInterval(3)
        repeat {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if let current = try? read() {
                latest = current.snapshot
                guard current.snapshot.selectedPersona == persona else { return failed(latest, "unknown") }
                let envio = current.sendButton ?? botonQueSeEnciende(antes: botonesAntes, ahora: current.pane.descendants())
                if !current.snapshot.busy && compositorListo(valor: current.composer.value, prompt: prompt, persona: persona, envioDisponible: envio?.enabled == true, ownAttachment: ownAttachment) {
                    ready = current; break
                }
            }
        } while Date() < composeDeadline
        // Primero la etiqueta conocida; si no esta, el que se acaba de encender.
        guard let current = ready,
              let sendNode = current.sendButton ?? botonQueSeEnciende(antes: botonesAntes, ahora: current.pane.descendants()),
              let send = sendNode.element, let currentComposer = current.composer.element,
              let currentHeading = current.heading.element,
              stringAttribute(currentHeading, kAXDescriptionAttribute) == persona,
              compositorListo(valor: stringAttribute(currentComposer, kAXValueAttribute), prompt: prompt, persona: persona, envioDisponible: sendNode.enabled && boolAttribute(send, kAXEnabledAttribute), ownAttachment: ownAttachment) else { return failed(latest, "send_not_ready") }
        // Exactly one press. Never retry after an AX error or ambiguous result.
        let press = AXUIElementPerformAction(send, kAXPressAction as CFString)
        guard press == .success else { return failed((try? read().snapshot) ?? latest, "unknown") }
        let deadline = Date().addingTimeInterval(8)
        repeat {
            RunLoop.current.run(until: Date().addingTimeInterval(0.15))
            if let after = try? read() {
                latest = after.snapshot
                guard latest.selectedPersona == persona else { return failed(latest, "unknown") }
                if latest.messages.contains(where: { $0.sender == "user" && !before.contains($0.key) && comparable($0.text) == comparable(prompt) }) { return latest }
            }
        } while Date() < deadline
        return failed(latest, "unknown")
    }
}

// Computer-surface frames and bounded input share the exact Grok Bot process/window.
// No display fallback, shell command, global hotkeys or arbitrary application.
struct RemoteTarget: Codable, Equatable {
    let persona: String
    let pid: Int32
    let windowID: UInt32
    let x: Double, y: Double, width: Double, height: Double
    var windowX: Double = 0, windowY: Double = 0, windowWidth: Double = 0, windowHeight: Double = 0
}
struct RemotePoint: Codable { let x: Double, y: Double }
struct RemoteInput: Decodable {
    let type: String
    let x: Double?, y: Double?, button: String?, clicks: Int?
    let dx: Double?, dy: Double?, path: [RemotePoint]?
    let key: String?, text: String?, modifiers: [String]?
}
struct RemoteFrame: Codable { let jpeg: String; let width: Int, height: Int }
struct RemoteReply: Codable {
    var ok = true
    var target: RemoteTarget? = nil
    var frame: RemoteFrame? = nil
}
// AppKit routes PID-scoped mouse events using an additional local position.
// Resolve the OS symbol defensively: unavailable means refuse, never global input.
// Reference: https://github.com/andelf/axcli/blob/main/src/input.rs
func setRemoteWindowLocation(_ event:CGEvent,_ point:CGPoint) throws {
    typealias Setter = @convention(c) (CGEvent,CGPoint) -> Void
    guard let symbol=dlsym(UnsafeMutableRawPointer(bitPattern:-2),"CGEventSetWindowLocation") else { throw BridgeError(code:"remote_input_unavailable") }
    unsafeBitCast(symbol,to:Setter.self)(event,point)
}
func remoteSurfaceRect(_ surface:CGRect,axWindow:CGRect,captureWindow:CGRect) -> CGRect {
    let sx=captureWindow.width/axWindow.width,sy=captureWindow.height/axWindow.height
    return CGRect(x:captureWindow.minX+(surface.minX-axWindow.minX)*sx,y:captureWindow.minY+(surface.minY-axWindow.minY)*sy,width:surface.width*sx,height:surface.height*sy)
}
func remotePoint(_ p: RemotePoint, target: RemoteTarget) throws -> CGPoint {
    guard p.x.isFinite, p.y.isFinite, p.x >= 0, p.x <= 1, p.y >= 0, p.y <= 1 else { throw BridgeError(code:"remote_invalid_input") }
    return CGPoint(x:target.x + p.x * (target.width - 1), y:target.y + p.y * (target.height - 1))
}
let remoteKeys: [String: CGKeyCode] = ["Enter":36,"Tab":48,"Escape":53,"Backspace":51,"Delete":117,"ArrowLeft":123,"ArrowRight":124,"ArrowDown":125,"ArrowUp":126,"Home":115,"End":119,"PageUp":116,"PageDown":121,"a":0,"c":8,"x":7,"v":9,"z":6,"y":16,"f":3]
extension GrokAX {
    func remoteSurface(_ persona:String,context:Context? = nil) throws -> Node {
        let ctx = try context ?? read()
        guard ctx.snapshot.selectedPersona == persona else { throw BridgeError(code:"remote_selection_changed") }
        let panes=ctx.root.descendants().filter { $0.role == "AXGroup" && $0.label == "Pantalla de " + persona }
        let surfaces=panes.flatMap { $0.descendants().filter { $0.role == "AXWebArea" } }
        guard surfaces.count == 1 else { throw BridgeError(code:"remote_computer_unavailable") }
        return surfaces[0]
    }
    func remoteOpen(_ persona:String) throws -> RemoteReply {
        let ctx=try read()
        guard ctx.snapshot.selectedPersona == persona else { throw BridgeError(code:"remote_selection_changed") }
        let restore=try activateForInteraction();defer { restore() }
        if (try? remoteSurface(persona,context:ctx)) == nil {
            let buttons=ctx.root.descendants().filter { $0.role == "AXButton" && $0.label == "Abrir computadora" && $0.enabled }
            guard buttons.count == 1, let button=buttons[0].element else { throw BridgeError(code:"remote_computer_unavailable") }
            guard AXUIElementPerformAction(button,kAXPressAction as CFString) == .success else { throw BridgeError(code:"remote_computer_unavailable") }
            let deadline=Date().addingTimeInterval(4)
            while Date() < deadline {
                if (try? remoteSurface(persona)) != nil { break }
                RunLoop.current.run(until:Date().addingTimeInterval(0.1))
            }
        }
        // App activation can settle AX and WindowServer on different ticks.
        // Retry the read only; input is never replayed.
        do { return try remoteFrame(persona) }
        catch let error as BridgeError where error.code == "remote_view_changed" {
            RunLoop.current.run(until:Date().addingTimeInterval(0.15))
            return try remoteFrame(persona)
        }
    }
    func remoteTarget(_ persona: String) throws -> RemoteTarget {
        let ctx = try read()
        guard ctx.snapshot.selectedPersona == persona else { throw BridgeError(code:"remote_selection_changed") }
        let windows = (attribute(app,kAXWindowsAttribute) as? [AXUIElement]) ?? []
        let exact = windows.filter { stringAttribute($0,kAXTitleAttribute) == "Grok Bot" }
        guard exact.count == 1 else { throw BridgeError(code:"remote_window_unavailable") }
        var position = CGPoint.zero, size = CGSize.zero, pid:pid_t = 0
        guard let pos = attribute(exact[0],kAXPositionAttribute), let siz = attribute(exact[0],kAXSizeAttribute),
              CFGetTypeID(pos) == AXValueGetTypeID(), CFGetTypeID(siz) == AXValueGetTypeID(),
              AXValueGetValue(pos as! AXValue,.cgPoint,&position), AXValueGetValue(siz as! AXValue,.cgSize,&size),
              AXUIElementGetPid(app,&pid) == .success else { throw BridgeError(code:"remote_window_unavailable") }
        let list = CGWindowListCopyWindowInfo([.optionAll,.excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
        let owned=list.filter { item in
            guard (item[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
                  (item[kCGWindowLayer as String] as? NSNumber)?.intValue == 0,
                  let bounds=item[kCGWindowBounds as String] as? [String:Any],let rect=CGRect(dictionaryRepresentation:bounds as CFDictionary) else { return false }
            return rect.width>100 && rect.height>100
        }
        let named=owned.filter { ($0[kCGWindowName as String] as? String) == "Grok Bot" }
        let exactGeometry=owned.filter { item in
            guard let bounds=item[kCGWindowBounds as String] as? [String:Any],let rect=CGRect(dictionaryRepresentation:bounds as CFDictionary) else{return false}
            return abs(rect.minX-position.x)<1 && abs(rect.minY-position.y)<1 && abs(rect.width-size.width)<1 && abs(rect.height-size.height)<1
        }
        let matches=named.count == 1 ? named : exactGeometry
        guard matches.count == 1,let wid=(matches[0][kCGWindowNumber as String] as? NSNumber)?.uint32Value,
              let rawBounds=matches[0][kCGWindowBounds as String] as? [String:Any],let windowRect=CGRect(dictionaryRepresentation:rawBounds as CFDictionary),size.width>100,size.height>100 else {
            var diagnostic:[String:Double]=["matches":Double(matches.count),"named":Double(named.count),"axX":position.x,"axY":position.y,"axW":size.width,"axH":size.height,"ownCount":Double(owned.count)]
            for (i,item) in owned.prefix(4).enumerated(){if let bounds=item[kCGWindowBounds as String] as? [String:Any],let r=CGRect(dictionaryRepresentation:bounds as CFDictionary){diagnostic["x"+String(i)]=r.minX;diagnostic["y"+String(i)]=r.minY;diagnostic["w"+String(i)]=r.width;diagnostic["h"+String(i)]=r.height}}
            throw BridgeError(code:"remote_window_geometry_unavailable",diagnostics:diagnostic)
        }
        let canvases=try remoteSurface(persona,context:ctx).descendants().filter { $0.role == "AXImage" }
        guard canvases.count == 1,let surface=canvases[0].element,
              let surfacePos=attribute(surface,kAXPositionAttribute),let surfaceSize=attribute(surface,kAXSizeAttribute),
              CFGetTypeID(surfacePos) == AXValueGetTypeID(),CFGetTypeID(surfaceSize) == AXValueGetTypeID() else { throw BridgeError(code:"remote_computer_unavailable") }
        var origin=CGPoint.zero, extent=CGSize.zero
        guard AXValueGetValue(surfacePos as! AXValue,.cgPoint,&origin),AXValueGetValue(surfaceSize as! AXValue,.cgSize,&extent),
              extent.width>100,extent.height>100,
              CGRect(origin:position,size:size).contains(CGRect(origin:origin,size:extent)) else { throw BridgeError(code:"remote_computer_unavailable") }
        let screen=remoteSurfaceRect(CGRect(origin:origin,size:extent),axWindow:CGRect(origin:position,size:size),captureWindow:windowRect)
        return RemoteTarget(persona:persona,pid:pid,windowID:wid,x:screen.minX,y:screen.minY,width:screen.width,height:screen.height,windowX:windowRect.minX,windowY:windowRect.minY,windowWidth:windowRect.width,windowHeight:windowRect.height)
    }
    func remoteFrame(_ persona:String) throws -> RemoteReply {
        let target = try remoteTarget(persona)
        guard #available(macOS 14.0, *),CGPreflightScreenCaptureAccess() else { throw BridgeError(code:"remote_capture_permission") }
        var content:SCShareableContent?,enumerated=false
        SCShareableContent.getExcludingDesktopWindows(true,onScreenWindowsOnly:false) { value,_ in content=value;enumerated=true }
        let deadline=Date().addingTimeInterval(6)
        while !enumerated && Date()<deadline { RunLoop.current.run(until:Date().addingTimeInterval(0.01)) }
        guard let window=content?.windows.first(where:{$0.windowID == target.windowID && $0.owningApplication?.processID == target.pid}) else { throw BridgeError(code:"remote_capture_window_unavailable",diagnostics:["enumerated":enumerated ? 1:0,"windows":Double(content?.windows.count ?? 0),"target":Double(target.windowID)]) }
        guard window.frame.width>100,window.frame.height>100,window.frame.minX.isFinite,window.frame.minY.isFinite else { throw BridgeError(code:"remote_capture_window_unavailable") }
        let filter=SCContentFilter(desktopIndependentWindow:window),config=SCStreamConfiguration()
        config.width=Int(target.windowWidth*2);config.height=Int(target.windowHeight*2);config.showsCursor=false
        if #available(macOS 14.2, *) { config.ignoreShadowsSingleWindow=true }
        var captured:CGImage?,finished=false
        SCScreenshotManager.captureImage(contentFilter:filter,configuration:config) { image,_ in captured=image;finished=true }
        let captureDeadline=Date().addingTimeInterval(6)
        while !finished && Date()<captureDeadline { RunLoop.current.run(until:Date().addingTimeInterval(0.01)) }
        guard let captured=captured else { throw BridgeError(code:"remote_capture_failed") }
        let bitmap=NSBitmapImageRep(cgImage:captured)
        let after=try remoteTarget(persona)
        guard after == target else { throw BridgeError(code:"remote_view_changed",diagnostics:["x":target.x,"y":target.y,"w":target.width,"h":target.height,"ax":after.x,"ay":after.y,"aw":after.width,"ah":after.height,"wx":target.windowX,"wy":target.windowY,"ww":target.windowWidth,"wh":target.windowHeight,"bwx":after.windowX,"bwy":after.windowY,"bww":after.windowWidth,"bwh":after.windowHeight,"id":Double(target.windowID),"bid":Double(after.windowID)]) }
        let sx=Double(bitmap.pixelsWide)/target.windowWidth,sy=Double(bitmap.pixelsHigh)/target.windowHeight
        let crop=CGRect(x:(target.x-target.windowX)*sx,y:(target.y-target.windowY)*sy,width:target.width*sx,height:target.height*sy).integral
        guard let image=bitmap.cgImage?.cropping(to:crop),let jpeg=NSBitmapImageRep(cgImage:image).representation(using:.jpeg,properties:[.compressionFactor:0.85]) else { throw BridgeError(code:"remote_crop_unavailable") }
        return RemoteReply(target:target,frame:RemoteFrame(jpeg:jpeg.base64EncodedString(),width:image.width,height:image.height))
    }
    func remoteInput(_ persona:String,target:RemoteTarget,event:RemoteInput) throws -> RemoteReply {
        guard target.persona == persona, try remoteTarget(persona) == target else { throw BridgeError(code:"remote_view_changed") }
        let restore=try activateForInteraction();defer { restore() }
        guard try remoteTarget(persona) == target else { throw BridgeError(code:"remote_view_changed") }
        if event.type == "key" || event.type == "text" {
            let keys=try remoteSurface(persona).descendants().filter { $0.role == "AXTextArea" && $0.label == "Remote desktop keyboard input" }
            guard keys.count == 1,let keyboard=keys[0].element,
                  AXUIElementSetAttributeValue(keyboard,kAXFocusedAttribute as CFString,kCFBooleanTrue) == .success else { throw BridgeError(code:"remote_keyboard_unavailable") }
        }
        var flags=CGEventFlags()
        for mod in event.modifiers ?? [] {
            switch mod {
            case "meta": flags.insert(.maskCommand)
            case "shift": flags.insert(.maskShift)
            case "alt": flags.insert(.maskAlternate)
            case "ctrl": flags.insert(.maskControl)
            default: throw BridgeError(code:"remote_invalid_input")
            }
        }
        func post(_ e:CGEvent?) throws {
            guard let e=e else { throw BridgeError(code:"remote_input_unavailable") }
            e.flags=flags; e.postToPid(target.pid)
        }
        func point(_ x:Double?,_ y:Double?) throws -> CGPoint {
            guard let x=x,let y=y else { throw BridgeError(code:"remote_invalid_input") }
            return try remotePoint(RemotePoint(x:x,y:y),target:target)
        }
        func mouse(_ kind:CGEventType,_ p:CGPoint,_ button:CGMouseButton = .left,_ clicks:Int = 1) throws {
            // AppKit mouse events carry window-local coordinates and a window ID.
            // A raw CGEvent posted to a PID lacks that association in Electron.
            let local=CGPoint(x:p.x-target.windowX,y:p.y-target.windowY)
            guard let type=NSEvent.EventType(rawValue:UInt(kind.rawValue)) else { throw BridgeError(code:"remote_invalid_input") }
            let e=NSEvent.mouseEvent(with:type,location:p,modifierFlags:NSEvent.ModifierFlags(rawValue:UInt(flags.rawValue)),timestamp:ProcessInfo.processInfo.systemUptime,windowNumber:Int(target.windowID),context:nil,eventNumber:Int(ProcessInfo.processInfo.systemUptime*1000),clickCount:clicks,pressure:1)?.cgEvent
            guard let e=e else { throw BridgeError(code:"remote_input_unavailable") }
            e.location=p
            e.setIntegerValueField(.mouseEventSubtype,value:3)
            e.setIntegerValueField(.mouseEventButtonNumber,value:button == .right ? 1 : 0)
            e.setIntegerValueField(.mouseEventClickState,value:Int64(clicks))
            e.setIntegerValueField(.mouseEventWindowUnderMousePointer,value:Int64(target.windowID))
            e.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent,value:Int64(target.windowID))
            try setRemoteWindowLocation(e,local);try post(e)
        }
        let modifierKeys:[(String,CGKeyCode,CGEventFlags)]=[("ctrl",59,.maskControl),("alt",58,.maskAlternate),("shift",56,.maskShift),("meta",55,.maskCommand)]
        let held=modifierKeys.filter { (event.modifiers ?? []).contains($0.0) }
        var heldFlags=CGEventFlags()
        for (_,code,flag) in held {
            heldFlags.insert(flag)
            let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:true)
            e?.type = .flagsChanged;e?.flags=heldFlags;e?.postToPid(target.pid)
        }
        defer {
            for (_,code,flag) in held.reversed() {
                heldFlags.remove(flag)
                let e=CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:false)
                e?.type = .flagsChanged;e?.flags=heldFlags;e?.postToPid(target.pid)
            }
        }
        switch event.type {
        case "click":
            let p=try point(event.x,event.y),right=event.button == "right",clicks=event.clicks ?? 1
            guard ["left","right"].contains(event.button ?? ""),[1,2].contains(clicks) else { throw BridgeError(code:"remote_invalid_input") }
            try mouse(.mouseMoved,p)
            RunLoop.current.run(until:Date().addingTimeInterval(0.03))
            try mouse(right ? .rightMouseDown : .leftMouseDown,p,right ? .right : .left,clicks)
            RunLoop.current.run(until:Date().addingTimeInterval(0.05))
            try mouse(right ? .rightMouseUp : .leftMouseUp,p,right ? .right : .left,clicks)
        case "drag":
            guard let path=event.path,path.count>=2,path.count<=40 else { throw BridgeError(code:"remote_invalid_input") }
            let points=try path.map{try remotePoint($0,target:target)}
            // A drag is one transaction: an interrupted network request cannot
            // leave a mouse button held down on the host.
            try mouse(.leftMouseDown,points[0])
            defer { try? mouse(.leftMouseUp,points.last!) }
            for p in points.dropFirst(){try mouse(.leftMouseDragged,p);RunLoop.current.run(until:Date().addingTimeInterval(0.008))}
        case "scroll":
            guard let dx=event.dx,let dy=event.dy,dx.isFinite,dy.isFinite,abs(dx)<=1200,abs(dy)<=1200 else { throw BridgeError(code:"remote_invalid_input") }
            let p=try point(event.x,event.y)
            let e=CGEvent(scrollWheelEvent2Source:nil,units:.pixel,wheelCount:2,wheel1:Int32(-dy),wheel2:Int32(-dx),wheel3:0)
            guard let e=e else { throw BridgeError(code:"remote_input_unavailable") }
            try mouse(.mouseMoved,p)
            e.location=p
            e.setIntegerValueField(.mouseEventWindowUnderMousePointer,value:Int64(target.windowID))
            e.setIntegerValueField(.mouseEventWindowUnderMousePointerThatCanHandleThisEvent,value:Int64(target.windowID))
            try setRemoteWindowLocation(e,CGPoint(x:p.x-target.windowX,y:p.y-target.windowY));try post(e)
        case "key":
            guard let key=event.key,let code=remoteKeys[key] else { throw BridgeError(code:"remote_invalid_input") }
            try post(CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:true));try post(CGEvent(keyboardEventSource:nil,virtualKey:code,keyDown:false))
        case "text":
            guard let text=event.text,!text.isEmpty,text.utf16.count<=4000,(event.modifiers ?? []).isEmpty else { throw BridgeError(code:"remote_invalid_input") }
            let chars=Array(text.utf16)
            for down in [true,false] {
                let e=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down)
                e?.keyboardSetUnicodeString(stringLength:chars.count,unicodeString:chars);try post(e)
            }
        default: throw BridgeError(code:"remote_invalid_input")
        }
        RunLoop.current.run(until:Date().addingTimeInterval(0.08))
        return RemoteReply()
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
    // Etiquetas reales leidas de la barra lateral el 20-sep-2026.
    try expect(esElBot("Steve Wozniak", "Steve Wozniak"), "plain sidebar label")
    try expect(esElBot("Steve Wozniak, Actividad no leida", "Steve Wozniak"), "unread suffix still selects")
    try expect(esElBot("Walt Disney, Trabajando", "Walt Disney"), "working suffix still selects")
    try expect(!esElBot("Steve Jobs", "Steve Wozniak"), "another bot never matches")
    try expect(!esElBot("Steve Wozniak Jr", "Steve Wozniak"), "prefix without comma is a different bot")
    let list = Node(role: "AXList", description: "Rutinas", children: [Node(role: "AXButton", children: [Node(role: "AXStaticText", value: "Rutina de prueba"), Node(role: "AXStaticText", value: "Cada día")])])
    let parsedRoutines = routineItems(list, persona: "Walt Disney")
    try expect(parsedRoutines?.count == 1 && parsedRoutines?.first?.schedule == "Cada día", "routine card parsing")
    try expect(parsedRoutines?.first?.id != routineItems(list, persona: "Steve Jobs")?.first?.id, "routine identity is bound to its adviser")
    try expect(routineItems(Node(), persona: "Walt Disney") == nil, "closed details are unavailable, not an empty routine list")
    let wrapped = Node(role: "AXList", title: "Rutinas", children: [Node(children: list.children)])
    try expect(routineItems(wrapped, persona: "Walt Disney")?.count == 1, "routine wrapper and title supported")
    try expect(routineItems(Node(role: "AXList", description: "Rutinas"), persona: "Walt Disney")?.count == 0, "empty routine list is available")
    let first = card("Tú 23:18", "Tu mensaje", "Primero")
    let second = card("Tú 23:18", "Tu mensaje", "Segundo")
    first.children.append(Node(domID: "sand-message-entry-one-timestamp"))
    second.children.append(Node(domID: "sand-message-entry-two-timestamp"))
    let distinct = parseMessages(Node(children:[first,second]), persona:"Steve Jobs", observedAt:at)
    try expect(distinct[0].key != distinct[1].key, "native IDs separate same-minute cards")
    try expect(distinct[0].legacyKey == distinct[1].legacyKey, "legacy migration key retained")
    try expect(!compositorListo(valor:"Agrega un mensaje o presiona enviar.",prompt:"test",persona:"Walt Disney",envioDisponible:true),"another attachment does not authorize sending")
    try expect(compositorListo(valor:"Agrega un mensaje o presiona enviar.",prompt:"test",persona:"Walt Disney",envioDisponible:true,ownAttachment:true),"owned attachment placeholder supports composition")
    try expect(!compositorListo(valor:"test",prompt:"test",persona:"Steve Jobs",envioDisponible:false),"exact text does not authorize a disabled Send")
    try expect(compositorListo(valor:"test",prompt:"test",persona:"Steve Jobs",envioDisponible:true),"exact text and enabled Send are ready")
    try expect(!compositorListo(valor:"another draft",prompt:"test",persona:"Steve Jobs",envioDisponible:true),"enabled Send cannot submit a different draft")
    try expect(!compositorListo(valor:"Escríbele a Steve Jobs",prompt:"test",persona:"Steve Jobs",envioDisponible:false),"placeholder and disabled Send must wait")
    let remoteBounds=RemoteTarget(persona:"Steve Jobs",pid:1,windowID:2,x:-1200,y:50,width:1000,height:800)
    let corner=try remotePoint(RemotePoint(x:1,y:1),target:remoteBounds)
    try expect(corner.x == -201 && corner.y == 849,"remote edges remain inside exact window on negative-coordinate display")
    var rejectedPoint=false
    do { _ = try remotePoint(RemotePoint(x:-0.1,y:0.5),target:remoteBounds) } catch { rejectedPoint=true }
    try expect(rejectedPoint,"remote input refuses coordinates outside the captured window")
    try expect(remoteKeys["q"] == nil && remoteKeys["Enter"] == 36,"remote key allowlist excludes quit but supports Enter")
    let mapped=remoteSurfaceRect(CGRect(x:100,y:200,width:800,height:500),axWindow:CGRect(x:0,y:31,width:1280,height:1410),captureWindow:CGRect(x:2000,y:50,width:2560,height:2820))
    try expect(mapped == CGRect(x:2200,y:388,width:1600,height:1000),"remote surface maps AX offsets and scaling to the capture window")
    print("{\"ok\":true,\"tests\":32,\"mode\":\"pure-parsing-no-AX\"}")
}

do {
    if CommandLine.arguments.contains("--self-test") { try selfTests(); exit(0) }
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 100000 else { throw BridgeError(code: "request_too_large") }
    let request: Request
    do { request = try JSONDecoder().decode(Request.self, from: data) }
    catch { throw BridgeError(code: "invalid_request") }
    guard ["snapshot", "select", "send", "dump", "probe", "routines", "routine", "routine_set", "interrupt", "remote_open", "remote_frame", "remote_input"].contains(request.action) else { throw BridgeError(code: "unsupported_action") }
    if request.action != "snapshot" && request.action != "dump" && request.action != "probe" {
        guard let persona = request.persona, supportedPersonas.contains(persona) else { throw BridgeError(code: "unsupported_persona") }
    }
    let bridge = try GrokAX()
    if ["remote_open","remote_frame","remote_input"].contains(request.action) {
        let lock=try MutationLock();defer { withExtendedLifetime(lock) {} }
        let result:RemoteReply
        if request.action == "remote_open" { result=try bridge.remoteOpen(request.persona!) }
        else if request.action == "remote_frame" { result=try bridge.remoteFrame(request.persona!) }
        else {
            guard let target=request.remoteTarget,let event=request.remoteEvent else { throw BridgeError(code:"remote_invalid_input") }
            result=try bridge.remoteInput(request.persona!,target:target,event:event)
        }
        FileHandle.standardOutput.write(try JSONEncoder().encode(result));exit(0)
    }
    let snapshot: Snapshot
    if request.action == "probe" {
        // SONDEO: escribe, mira si aparece el boton de enviar, y BORRA lo escrito
        // sin pulsarlo. Sirve para comprobar el arreglo sin mandar un mensaje de
        // verdad al chat de un consejero ni dejar un borrador atascado.
        let ctx = try bridge.read()
        guard let composer = ctx.composer.element else { throw BridgeError(code: "composer_unavailable") }
        let antes = botonesHabilitados(ctx.pane.descendants())
        _ = AXUIElementSetAttributeValue(composer, kAXValueAttribute as CFString, "sondeo" as CFString)
        Thread.sleep(forTimeInterval: 0.8)
        var encontrado = "(ninguno)"
        var candidatos: [String] = []
        if let despues = try? bridge.read() {
            var vistos: [String: Int] = [:]
            for n in despues.pane.descendants() where n.role == "AXButton" {
                let k = botonClave(n, &vistos)
                if n.enabled && !antes.contains(k) { candidatos.append(k) }
            }
            if let b = botonQueSeEnciende(antes: antes, ahora: despues.pane.descendants()) { encontrado = b.label.isEmpty ? "(sin etiqueta)" : b.label }
        }
        _ = AXUIElementSetAttributeValue(composer, kAXValueAttribute as CFString, "" as CFString)
        // Replica TODAS las comprobaciones de send() sin pulsar, y dice en cual
        // se pararia. Asi se localiza el fallo sin mandar nada a nadie.
        var paradas: [String] = []
        let pedida = request.persona ?? ctx.snapshot.selectedPersona ?? ""
        if ctx.snapshot.selectedPersona != pedida { paradas.append("persona_not_selected (seleccionada=\(ctx.snapshot.selectedPersona ?? "nil"), pedida=\(pedida))") }
        if ctx.snapshot.composerHasDraft { paradas.append("draft_exists") }
        if ctx.snapshot.busy { paradas.append("conversation_busy") }
        var settable: DarwinBoolean = false
        if !(AXUIElementIsAttributeSettable(composer, kAXValueAttribute as CFString, &settable) == .success && settable.boolValue) { paradas.append("composer_not_writable") }
        if let h = ctx.heading.element {
            let desc = stringAttribute(h, kAXDescriptionAttribute)
            if desc != pedida { paradas.append("heading_no_coincide (heading=\(desc), pedida=\(pedida))") }
        } else { paradas.append("heading_ausente") }
        var leido = "(no leido)"
        if let d2 = try? bridge.read() { leido = d2.composer.value }
        let envioOk = encontrado != "(ninguno)"
        if !compositorListo(valor: leido, prompt: "sondeo", persona: pedida, envioDisponible: envioOk) {
            paradas.append("composer_no_listo (leido=\(leido), envioDisponible=\(envioOk))")
        }
        let salida = ["ok": true, "botonDeEnvioDetectado": encontrado, "candidatosNuevos": candidatos,
                      "etiquetaViejaExiste": ctx.sendButton != nil,
                      "seParariaEn": paradas.isEmpty ? ["(nada: enviaria)"] : paradas] as [String: Any]
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: salida, options: [.sortedKeys]))
        FileHandle.standardOutput.write(Data("\n".utf8))
        exit(0)
    }
    if request.action == "dump" {
        // Solo lectura: lista lo que el puente ve, para no volver a diagnosticar a ciegas.
        let ctx = try bridge.read()
        var vistos: [String: Int] = [:]
        let lineas = ctx.pane.descendants().filter { $0.role == "AXButton" }.map { n -> String in
            botonClave(n, &vistos) + (n.enabled ? " [encendido]" : " [apagado]")
        }
        let salida = ["ok": true, "botones": lineas, "composerHasDraft": ctx.snapshot.composerHasDraft] as [String: Any]
        let datos = try JSONSerialization.data(withJSONObject: salida, options: [.sortedKeys])
        FileHandle.standardOutput.write(datos); FileHandle.standardOutput.write(Data("\n".utf8))
        exit(0)
    }
    if request.action == "snapshot" {
        snapshot = try bridge.read().snapshot // No selection, focus, or AX mutation.
    } else {
        let lock = try MutationLock()
        defer { withExtendedLifetime(lock) {} }
        if request.action == "select" { snapshot = try bridge.select(request.persona!) }
        else if request.action == "routines" { snapshot = try bridge.routineList(request.persona!).snapshot }
        else if request.action == "routine" || request.action == "routine_set" {
            guard let id = request.routineID, id.count == 64 else { throw BridgeError(code: "invalid_routine") }
            if request.action == "routine_set" && (request.paused == nil || request.revision == nil) { throw BridgeError(code: "invalid_routine") }
            snapshot = try bridge.routine(request.persona!, id: id, paused: request.action == "routine_set" ? request.paused : nil, revision: request.revision)
        }
        else if request.action == "interrupt" {
            guard let key = request.runKey, !key.isEmpty else { throw BridgeError(code: "invalid_run") }
            snapshot = try bridge.interrupt(request.persona!, runKey: key)
        }
        else {
            guard let prompt = request.prompt, !normalized(prompt).isEmpty, prompt.count <= 16000 else { throw BridgeError(code: "invalid_prompt") }
            snapshot = try bridge.send(request.persona!, prompt: prompt, attachmentPaths: request.attachmentPaths ?? [])
        }
    }
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    FileHandle.standardOutput.write(try encoder.encode(snapshot)); FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    if let issue=error as? BridgeError,let diagnostic=issue.diagnostics,let data=try? JSONSerialization.data(withJSONObject:["ok":false,"error":issue.code,"diagnostics":diagnostic]) {FileHandle.standardOutput.write(data);exit(1)}
    var failure = Snapshot(); failure.ok = false
    failure.error = (error as? BridgeError)?.code ?? "accessibility_unavailable"
    failure.busy = failure.error == "bridge_busy"
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(failure) { FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data("\n".utf8)) }
    exit(1)
}
