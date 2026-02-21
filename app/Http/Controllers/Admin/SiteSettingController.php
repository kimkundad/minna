<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use App\Models\Subscriber;
use Illuminate\Http\Request;

class SiteSettingController extends Controller
{
    public function edit()
    {
        $settings = SiteSetting::query()->pluck('value', 'key');
        $subscribers = Subscriber::query()->latest()->paginate(20);

        return view('admin.settings.general', compact('settings', 'subscribers'));
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'contact_phone' => 'nullable|string|max:100',
            'contact_email' => 'nullable|email|max:255',
            'facebook_url' => 'nullable|url|max:255',
            'twitter_url' => 'nullable|url|max:255',
            'skype_url' => 'nullable|url|max:255',
            'instagram_url' => 'nullable|url|max:255',
        ]);

        foreach ($validated as $key => $value) {
            SiteSetting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        return redirect()
            ->route('admin.settings.general')
            ->with('success', 'บันทึกการตั้งค่าเว็บไซต์เรียบร้อยแล้ว');
    }
}

