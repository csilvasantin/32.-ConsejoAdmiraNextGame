// lector — LECTOR BLE de balizas para admira.live/ubicacion (FLT-100579 · MorfeoMacMini · 18-09-2026).
// Escanea tramas Google FMDN (0xFEAA/0x40), iBeacon (0x004C/0x02) y Apple Find My (0x004C/0x12) y, por cada
// baliza vista, reporta a /ubicacion/report la POSICIÓN DEL LECTOR (lat/lng fijas) con acc ≈ distancia estimada
// por RSSI. Modo «rotacion»: sólo registra cada 30 s los identificadores FMDN vistos, para medir cuándo rotan.
//   lector.app --args lector <evento> <lat> <lng> <segundos> [nombres.json]   | --args rotacion <segundos>
import Foundation
import CoreBluetooth
import CoreLocation
let outPath = ProcessInfo.processInfo.environment["BLESCAN_OUT"] ?? "/tmp/lector.txt"
freopen(outPath, "a", stdout); freopen(outPath, "a", stderr); setvbuf(stdout, nil, _IONBF, 0)
let a = CommandLine.arguments
let modo = a.count > 1 ? a[1] : "rotacion"
func hex(_ d: Data) -> String { d.map { String(format: "%02x", $0) }.joined() }
func ts() -> String { let f = DateFormatter(); f.dateFormat = "HH:mm:ss"; return f.string(from: Date()) }
// distancia aproximada por RSSI (path-loss n=2.5, txPower -59 dBm a 1 m): es una ESTIMACIÓN, no una medida
func metros(_ rssi: Int) -> Double { pow(10.0, Double(-59 - rssi) / (10.0 * 2.5)) }

struct Baliza { var tipo: String; var id: String }
func clasifica(_ adv: [String: Any]) -> Baliza? {
    if let md = adv[CBAdvertisementDataManufacturerDataKey] as? Data, md.count >= 4, UInt16(md[1]) << 8 | UInt16(md[0]) == 0x004C {
        if md[2] == 0x02, md.count >= 25 { return Baliza(tipo: "ibeacon", id: hex(md[4..<20]) + "-" + String(UInt16(md[20]) << 8 | UInt16(md[21])) + "-" + String(UInt16(md[22]) << 8 | UInt16(md[23]))) }
        if md[2] == 0x12, md.count >= 10 { return Baliza(tipo: "findmy", id: hex(md[4..<min(md.count, 12)])) }
    }
    if let sd = adv[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data] {
        for (u, d) in sd where u.uuidString.uppercased() == "FEAA" && d.count >= 21 && d[0] == 0x40 { return Baliza(tipo: "fmdn", id: hex(d[1..<21])) }
    }
    return nil
}

class Lector: NSObject, CBCentralManagerDelegate {
    var cm: CBCentralManager!
    var vistas: [String: (Baliza, Int, Date)] = [:]   // id -> (baliza, mejor rssi de la ventana, última vez)
    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        print("\(ts()) bluetooth estado \(c.state.rawValue)")
        if c.state == .poweredOn { c.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]) }
    }
    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral, advertisementData adv: [String: Any], rssi: NSNumber) {
        guard let b = clasifica(adv) else { return }
        let r = rssi.intValue
        if let v = vistas[b.id] { vistas[b.id] = (b, max(v.1, r), Date()) } else { vistas[b.id] = (b, r, Date()) }
    }
}
let L = Lector(); L.cm = CBCentralManager(delegate: L, queue: nil)

if modo == "rotacion" {
    let dur = Double(a.count > 2 ? a[2] : "1200") ?? 1200
    let fin = Date().addingTimeInterval(dur)
    print("\(ts()) rotacion · \(Int(dur)) s · cada 30 s: identificadores FMDN vistos (id corto · rssi)")
    while Date() < fin {
        RunLoop.main.run(until: Date().addingTimeInterval(30))
        let f = L.vistas.values.filter { $0.0.tipo == "fmdn" && $0.2.timeIntervalSinceNow > -30 }.sorted { $0.1 > $1.1 }
        print("\(ts()) " + (f.isEmpty ? "(ninguna FMDN)" : f.map { "\($0.0.id.prefix(8)) \($0.1)" }.joined(separator: " · ")))
    }
    exit(0)
}

// modo lector: reporta cada 5 s las balizas vistas en los últimos 10 s
let evento = a.count > 2 ? a[2] : "demo"
var lat = Double(a.count > 3 ? a[3] : "0") ?? 0, lng = Double(a.count > 4 ? a[4] : "0") ?? 0
// El lector se AUTOUBICA (Wi-Fi/IP de macOS) si no le dan coordenadas. Pide permiso de Localización una vez.
class Loc: NSObject, CLLocationManagerDelegate {
    let m = CLLocationManager(); var fix: CLLocation?; var err = ""
    override init() { super.init(); m.delegate = self; m.desiredAccuracy = kCLLocationAccuracyHundredMeters }
    func pide() { m.requestWhenInUseAuthorization(); m.requestLocation() }
    func locationManager(_ mgr: CLLocationManager, didUpdateLocations l: [CLLocation]) { fix = l.last }
    func locationManager(_ mgr: CLLocationManager, didFailWithError e: Error) { err = e.localizedDescription }
    func locationManagerDidChangeAuthorization(_ mgr: CLLocationManager) { if mgr.authorizationStatus == .authorized || mgr.authorizationStatus == .authorizedAlways { mgr.requestLocation() } }
}
if lat == 0 && lng == 0 {
    let loc = Loc(); loc.pide(); let hasta = Date().addingTimeInterval(60)
    var intentos = 0
    while loc.fix == nil && Date() < hasta {
        RunLoop.main.run(until: Date().addingTimeInterval(0.5))
        if !loc.err.isEmpty && intentos < 5 { intentos += 1; print("\(ts()) localización: \(loc.err) · reintento \(intentos)"); loc.err = ""; RunLoop.main.run(until: Date().addingTimeInterval(4)); loc.m.requestLocation() }
    }
    if let f = loc.fix { lat = f.coordinate.latitude; lng = f.coordinate.longitude; print("\(ts()) lector autoubicado: \(lat),\(lng) ±\(Int(f.horizontalAccuracy)) m") }
    else { print("\(ts()) SIN posición del lector (\(loc.err.isEmpty ? "sin permiso o sin respuesta" : loc.err)): no reporto nada"); exit(2) }
}
let dur = Double(a.count > 5 ? a[5] : "600") ?? 600
var nombres: [String: [String: Any]] = [:]
if a.count > 6, let d = FileManager.default.contents(atPath: a[6]), let j = try? JSONSerialization.jsonObject(with: d) as? [String: [String: Any]] { nombres = j }
print("\(ts()) lector · evento \(evento) · lector en \(lat),\(lng) · \(Int(dur)) s · \(nombres.count) balizas con nombre")
let fin = Date().addingTimeInterval(dur)
func reporta(_ id: String, _ tipo: String, _ rssi: Int) {
    let conf = nombres[id] ?? nombres[String(id.prefix(8))]
    let invitado = (conf?["invitado"] as? String) ?? "\(tipo)-\(id.prefix(8))"
    let nombre = (conf?["nombre"] as? String) ?? "Badge \(tipo) \(id.prefix(6))"
    let vip = (conf?["vip"] as? Bool) ?? false
    let body: [String: Any] = ["evento": evento, "invitado": invitado, "nombre": nombre, "vip": vip, "lat": lat, "lng": lng, "acc": Int(min(200, max(2, metros(rssi))))]
    var req = URLRequest(url: URL(string: "https://api.yokup.com/ubicacion/report")!); req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.setValue("Mozilla/5.0 lector-admira", forHTTPHeaderField: "User-Agent")
    req.httpBody = try? JSONSerialization.data(withJSONObject: body)
    let sem = DispatchSemaphore(value: 0); var res = "?"
    URLSession.shared.dataTask(with: req) { d, r, e in res = e != nil ? "red: \(e!.localizedDescription)" : "\((r as? HTTPURLResponse)?.statusCode ?? 0)"; sem.signal() }.resume()
    _ = sem.wait(timeout: .now() + 10)
    print("\(ts()) → \(invitado) (\(nombre)) rssi \(rssi) ≈ \(Int(metros(rssi))) m · \(res)")
}
while Date() < fin {
    RunLoop.main.run(until: Date().addingTimeInterval(5))
    for (id, v) in L.vistas where v.2.timeIntervalSinceNow > -10 && v.1 > -100 { reporta(id, v.0.tipo, v.1); L.vistas.removeValue(forKey: id) }
}
print("\(ts()) fin")
