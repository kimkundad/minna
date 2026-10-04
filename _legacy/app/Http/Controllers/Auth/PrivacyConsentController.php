<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class PrivacyConsentController extends Controller
{
    public function show()
    {
        return view('auth.privacy-consent');
    }

    public function accept(Request $request)
    {
        $request->validate([
            'accept_privacy' => ['accepted'],
        ]);

        $request->user()->forceFill([
            'privacy_accepted_at' => now(),
        ])->save();

        return redirect()->route('student.index')->with('status', 'ยอมรับนโยบายข้อมูลส่วนบุคคลเรียบร้อยแล้ว');
    }
}
