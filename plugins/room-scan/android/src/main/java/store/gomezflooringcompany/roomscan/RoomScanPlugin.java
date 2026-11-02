package store.gomezflooringcompany.roomscan;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android camera measuring (ARCore tap-the-corners) is phase 2.
 * Until then the app falls back to the tape measure guide on Android.
 */
@CapacitorPlugin(name = "RoomScan")
public class RoomScanPlugin extends Plugin {
    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject r = new JSObject();
        r.put("supported", false);
        r.put("method", "none");
        call.resolve(r);
    }

    @PluginMethod
    public void scanRoom(PluginCall call) {
        call.reject("Camera measuring is coming soon on Android. Use the tape measure guide.", "UNSUPPORTED");
    }
}
