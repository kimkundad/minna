<?php

namespace App\Http\Responses;

use Illuminate\Support\Facades\Auth;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;

class LoginResponse implements LoginResponseContract
{
    public function toResponse($request)
    {
        $user = $request->user();

        if ($user && $user->roles()->where('name', 'admin')->exists()) {
            return redirect()->route('admin.index');
        }

        if ($user && $user->roles()->where('name', 'teacher')->exists()) {
            return redirect()->route('teacher.index');
        }

        if ($user && $user->roles()->where('name', 'student')->exists()) {
            if (! $user->privacy_accepted_at) {
                return redirect()->route('privacy.accept.show');
            }

            return redirect()->route('student.index');
        }

        // No role assigned -> prevent redirect loop to /dashboard
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login')->withErrors([
            'email' => 'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ กรุณาติดต่อผู้ดูแลระบบ',
        ]);
    }
}
