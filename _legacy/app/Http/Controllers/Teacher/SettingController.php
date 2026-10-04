<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    public function edit()
    {
        return view('teacher.settings.edit', [
            'teacher' => auth()->user(),
        ]);
    }

    public function update(Request $request)
    {
        $teacher = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'birthdate' => 'nullable|date',
            'gender' => 'nullable|in:female,male,other',
            'address' => 'nullable|string|max:255',
            'line_id' => 'nullable|string|max:255',
            'profile_photo' => 'nullable|image|max:5120',
        ]);

        if ($request->hasFile('profile_photo')) {
            if ($teacher->profile_photo_path) {
                Storage::disk('spaces')->delete($teacher->profile_photo_path);
            }
            $validated['profile_photo_path'] = $request->file('profile_photo')->store('profile-photos', 'spaces');
        }

        $teacher->update($validated);

        return redirect()->route('teacher.settings.edit')->with('success', 'บันทึกข้อมูลเรียบร้อยแล้ว');
    }
}
