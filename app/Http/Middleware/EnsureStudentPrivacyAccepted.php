<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureStudentPrivacyAccepted
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (
            $user &&
            $user->hasRole('student') &&
            ! $user->privacy_accepted_at &&
            ! $request->routeIs('privacy.accept.show', 'privacy.accept.submit', 'logout')
        ) {
            return redirect()->route('privacy.accept.show');
        }

        return $next($request);
    }
}
