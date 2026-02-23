<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Auth;

class RedirectController extends Controller
{
    public function __invoke()
    {
        $user = Auth::user();
       // dd($user->hasRole('admin'));
        if (! $user) {
            return redirect()->route('login');
        }

        if ($user->hasRole('admin')) {
            return redirect()->route('admin.index');
        }

        if ($user->hasRole('teacher')) {
            return redirect()->route('teacher.index');
        }

        if ($user->hasRole('student')) {
            if (! $user->privacy_accepted_at) {
                return redirect()->route('privacy.accept.show');
            }

            return redirect()->route('student.index');
        }

        // Fallback: no known role, force logout to avoid redirect loop
        Auth::guard('web')->logout();
        request()->session()->invalidate();
        request()->session()->regenerateToken();

        return redirect()->route('login')->withErrors([
            'email' => 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ กรุณาติดต่อผู้ดูแลระบบ',
        ]);
    }
}
