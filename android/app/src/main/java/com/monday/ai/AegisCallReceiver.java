package com.monday.ai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.TelephonyManager;
import android.util.Log;

public class AegisCallReceiver extends BroadcastReceiver {
    private static final String TAG = "AegisCallReceiver";

    private static String lastState = TelephonyManager.EXTRA_STATE_IDLE;
    private static long ringStartTime = 0L;
    private static boolean isIncomingRinging = false;
    private static String savedNumber = "";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        if ("com.monday.ai.SIMULATE_CALL".equals(intent.getAction())) {
            Log.d(TAG, "Simulate call broadcast received!");
            AegisCallHandler.getInstance(context).simulateCallInterception();
            return;
        }

        if (intent.getAction().equals(TelephonyManager.ACTION_PHONE_STATE_CHANGED)) {
            String stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
            String incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);

            if (incomingNumber != null && !incomingNumber.trim().isEmpty()) {
                savedNumber = incomingNumber;
            }

            if (stateStr == null) return;

            Log.d(TAG, "Phone State Change: " + stateStr + " | number=" + savedNumber);

            if (stateStr.equals(TelephonyManager.EXTRA_STATE_RINGING)) {
                isIncomingRinging = true;
                ringStartTime = System.currentTimeMillis();
                AegisCallHandler.getInstance(context).handleIncomingRinging(savedNumber);
            } else if (stateStr.equals(TelephonyManager.EXTRA_STATE_OFFHOOK)) {
                if (lastState.equals(TelephonyManager.EXTRA_STATE_RINGING)) {
                    // Call was answered by human user
                    isIncomingRinging = false;
                    AegisCallHandler.getInstance(context).handleCallAnsweredByUser();
                }
            } else if (stateStr.equals(TelephonyManager.EXTRA_STATE_IDLE)) {
                if (lastState.equals(TelephonyManager.EXTRA_STATE_RINGING) && isIncomingRinging) {
                    long ringDuration = System.currentTimeMillis() - ringStartTime;
                    // If call transitioned to IDLE quickly (<18 seconds) after ringing without offhook,
                    // it indicates the user actively declined / rejected the incoming call.
                    boolean wasDeclinedQuickly = ringDuration < 18000L;
                    isIncomingRinging = false;
                    AegisCallHandler.getInstance(context).handleCallEndedOrDeclined(wasDeclinedQuickly);
                } else {
                    isIncomingRinging = false;
                    AegisCallHandler.getInstance(context).handleCallEndedOrDeclined(false);
                }
            }

            lastState = stateStr;
        }
    }
}
