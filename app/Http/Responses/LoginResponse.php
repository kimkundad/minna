<?php

namespace App\Http\Responses;

use Illuminate\Http\Request;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;

class LoginResponse implements LoginResponseContract
{
    public function toResponse($request)
    {
        $user = $request->user();

        if ($user?->hasRole('admin')) {
            return redirect()->route('admin.index');
        }

        if ($user?->hasRole('teacher')) {
            return redirect()->route('teacher.index');
        }

        if ($user?->hasRole('student')) {
            if (! $user->privacy_accepted_at) {
                return redirect()->route('privacy.accept.show');
            }

            return redirect()->route('student.index');
        }

        return redirect(config('fortify.home'));
    }
}
