<?php

namespace App\Http\Controllers\Auth;

use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class RedirectController extends Controller
{
    //
    public function __invoke()
    {
        $user = Auth::user();
        // dd($user->hasRole('admin'));
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

        // fallback
        return redirect()->route('dashboard');
    }
}
