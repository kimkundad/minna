<?php

namespace App\Http\Controllers;

use App\Models\Subscriber;
use Illuminate\Http\Request;

class SubscriberController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email|max:255|unique:subscribers,email',
        ]);

        Subscriber::query()->create($validated);

        return back()->with('subscribe_success', 'ติดตามข่าวสารเรียบร้อยแล้ว');
    }
}

