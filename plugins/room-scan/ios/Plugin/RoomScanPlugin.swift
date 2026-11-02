import Foundation
import UIKit
import Capacitor
#if canImport(RoomPlan)
import RoomPlan
#endif

/// JS name: RoomScan. Methods: isSupported() -> { supported }, scanRoom() -> measurements.
@objc(RoomScanPlugin)
public class RoomScanPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoomScanPlugin"
    public let jsName = "RoomScan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanRoom", returnType: CAPPluginReturnPromise)
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        var ok = false
        #if canImport(RoomPlan)
        if #available(iOS 17.0, *) { ok = RoomCaptureSession.isSupported }
        #endif
        call.resolve(["supported": ok, "method": ok ? "roomplan" : "none"])
    }

    @objc func scanRoom(_ call: CAPPluginCall) {
        #if canImport(RoomPlan)
        if #available(iOS 17.0, *), RoomCaptureSession.isSupported {
            DispatchQueue.main.async {
                let vc = RoomScanViewController()
                vc.modalPresentationStyle = .fullScreen
                vc.onDone = { result in call.resolve(result) }
                vc.onCancel = { call.reject("cancelled", "CANCELLED") }
                self.bridge?.viewController?.present(vc, animated: true)
            }
            return
        }
        #endif
        call.reject("This phone can't scan rooms. Use the tape measure guide.", "UNSUPPORTED")
    }
}

#if canImport(RoomPlan)
@available(iOS 17.0, *)
class RoomScanViewController: UIViewController, RoomCaptureViewDelegate {
    var onDone: (([String: Any]) -> Void)?
    var onCancel: (() -> Void)?
    private var captureView: RoomCaptureView!
    private var result: [String: Any]?
    private let actionButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let hint = UILabel()
    private var finishedCallback = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        captureView = RoomCaptureView(frame: view.bounds)
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        captureView.delegate = self
        view.addSubview(captureView)

        hint.text = "Walk slowly around the room. Point the camera at every wall and the floor."
        hint.numberOfLines = 0
        hint.textAlignment = .center
        hint.textColor = .white
        hint.font = .systemFont(ofSize: 16, weight: .semibold)
        hint.backgroundColor = UIColor(white: 0, alpha: 0.55)
        hint.layer.cornerRadius = 10
        hint.clipsToBounds = true

        style(actionButton, title: "Done scanning", filled: true)
        actionButton.addTarget(self, action: #selector(actionTapped), for: .touchUpInside)
        style(cancelButton, title: "Cancel", filled: false)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        for v in [hint, actionButton, cancelButton] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            hint.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
            hint.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            hint.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            hint.heightAnchor.constraint(greaterThanOrEqualToConstant: 56),
            actionButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
            actionButton.trailingAnchor.constraint(equalTo: g.trailingAnchor, constant: -16),
            actionButton.heightAnchor.constraint(equalToConstant: 52),
            actionButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 190),
            cancelButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
            cancelButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 16),
            cancelButton.heightAnchor.constraint(equalToConstant: 52),
            cancelButton.widthAnchor.constraint(equalToConstant: 100)
        ])
    }

    private func style(_ b: UIButton, title: String, filled: Bool) {
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        b.layer.cornerRadius = 12
        b.contentEdgeInsets = UIEdgeInsets(top: 0, left: 18, bottom: 0, right: 18)
        if filled {
            b.backgroundColor = .white // GFC navy + white
            b.setTitleColor(UIColor(red: 0.06, green: 0.12, blue: 0.24, alpha: 1), for: .normal)
        } else {
            b.backgroundColor = UIColor(white: 1, alpha: 0.85)
            b.setTitleColor(UIColor(red: 0.06, green: 0.12, blue: 0.24, alpha: 1), for: .normal)
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        captureView.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    @objc private func actionTapped() {
        if let r = result {
            finish { self.onDone?(r) }
        } else {
            actionButton.isEnabled = false
            actionButton.setTitle("Measuring…", for: .normal)
            captureView.captureSession.stop()
        }
    }

    @objc private func cancelTapped() {
        captureView.captureSession.stop()
        finish { self.onCancel?() }
    }

    private func finish(_ then: @escaping () -> Void) {
        guard !finishedCallback else { return }
        finishedCallback = true
        dismiss(animated: true, completion: then)
    }

    // RoomCaptureViewDelegate
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool { true }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        if let error = error {
            hint.text = "Scan didn't finish (\(error.localizedDescription)). Tap Cancel and try again, or use the tape measure."
            actionButton.isEnabled = false
            return
        }
        let r = RoomScanViewController.measure(processedResult)
        result = r
        let sf = (r["areaSqFt"] as? Double) ?? 0
        hint.text = String(format: "Measured about %.0f sq ft. Check the plan, then tap Use measurements.", sf)
        actionButton.isEnabled = true
        actionButton.setTitle("Use measurements", for: .normal)
    }

    /// Floor area from the floor polygon, wall lengths for the trim, all in feet.
    static func measure(_ room: CapturedRoom) -> [String: Any] {
        let m2ft = 3.28084
        var areaM2 = 0.0
        var lengthM = 0.0
        var widthM = 0.0
        for f in room.floors {
            let pts = f.polygonCorners
            let a = max(shoelace(pts.map { (Double($0.x), Double($0.y)) }),
                        shoelace(pts.map { (Double($0.x), Double($0.z)) }))
            let box = Double(f.dimensions.x) * Double(max(f.dimensions.y, f.dimensions.z))
            areaM2 += a > 0.5 ? a : box
            let l = Double(max(f.dimensions.x, max(f.dimensions.y, f.dimensions.z)))
            let w = Double(f.dimensions.x == Float(l) ? max(f.dimensions.y, f.dimensions.z) : f.dimensions.x)
            if l * w > lengthM * widthM { lengthM = l; widthM = w }
        }
        if areaM2 == 0 { // no floor found: estimate from the walls' bounding box
            var xs: [Double] = [], zs: [Double] = []
            for w in room.walls { xs.append(Double(w.transform.columns.3.x)); zs.append(Double(w.transform.columns.3.z)) }
            if let x0 = xs.min(), let x1 = xs.max(), let z0 = zs.min(), let z1 = zs.max() {
                lengthM = max(x1 - x0, z1 - z0); widthM = min(x1 - x0, z1 - z0); areaM2 = lengthM * widthM
            }
        }
        let perimeterM = room.walls.reduce(0.0) { $0 + Double($1.dimensions.x) }
        return [
            "areaSqFt": areaM2 * m2ft * m2ft,
            "lengthFt": lengthM * m2ft,
            "widthFt": widthM * m2ft,
            "perimeterFt": perimeterM * m2ft,
            "walls": room.walls.count,
            "doors": room.doors.count,
            "method": "roomplan"
        ]
    }

    static func shoelace(_ p: [(Double, Double)]) -> Double {
        guard p.count >= 3 else { return 0 }
        var s = 0.0
        for i in 0..<p.count {
            let (x1, y1) = p[i], (x2, y2) = p[(i + 1) % p.count]
            s += x1 * y2 - x2 * y1
        }
        return abs(s) / 2
    }
}
#endif
