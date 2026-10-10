package com.monday.ai;

import android.os.Build;
import android.telecom.Call;
import android.telecom.InCallService;
import android.util.Log;

public class AegisInCallService extends InCallService {
    private static final String TAG = "AegisInCallService";

    @Override
    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        if (call == null) return;

        Log.d(TAG, "InCallService onCallAdded: state=" + call.getState());

        call.registerCallback(new Call.Callback() {
            @Override
            public void onStateChanged(Call c, int state) {
                super.onStateChanged(c, state);
                Log.d(TAG, "InCallService Call State: " + state);
                if (state == Call.STATE_DISCONNECTED) {
                    AegisCallHandler.getInstance(AegisInCallService.this).handleCallEndedOrDeclined(false);
                }
            }
        });

        AegisCallHandler.getInstance(this).onCallAddedFromInCallService(call);
    }

    @Override
    public void onCallRemoved(Call call) {
        super.onCallRemoved(call);
        Log.d(TAG, "InCallService onCallRemoved");
    }
}
