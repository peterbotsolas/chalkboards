import UIKit
import Capacitor
import WebKit

class CustomViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Match LaunchScreen background (black) so there's no white flash
        view.backgroundColor = .black

        // Make WKWebView also start black
        webView?.isOpaque = false
        webView?.backgroundColor = .black
        webView?.scrollView.backgroundColor = .black
    }
}
