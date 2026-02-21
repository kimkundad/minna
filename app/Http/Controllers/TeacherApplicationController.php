<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\TeacherApplication;
use Illuminate\Support\Facades\Storage;

class TeacherApplicationController extends Controller
{
    //

    public function create()
    {
        return view('teacher.apply');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'phone' => 'required|string|max:20',
            'subject' => 'required|string|max:255',
            'experience' => 'required|string',
            'reason' => 'nullable|string',
            'resume' => 'nullable|file|mimes:pdf,doc,docx,jpg,jpeg,png,webp,mp4,mov,avi,webm,mkv|max:51200',
        ]);

        if ($request->hasFile('resume')) {
            $file = $request->file('resume');
            $path = $file->store('resumes', 'spaces'); // Ã¢Å“â€¦ Ã Â¹â‚¬Ã Â¸ÂÃ Â¹â€¡Ã Â¸Å¡Ã Â¹Æ’Ã Â¸â„¢ DigitalOcean Spaces
            $validated['resume_path'] = Storage::disk('spaces')->url($path); // Ã¢Å“â€¦ Ã Â¹â‚¬Ã Â¸ÂÃ Â¹â€¡Ã Â¸Å¡ URL Ã Â¹ÂÃ Â¸Å¡Ã Â¸Å¡Ã Â¹â‚¬Ã Â¸â€¢Ã Â¹â€¡Ã Â¸Â¡
        }

        TeacherApplication::create($validated);

        return redirect()->back()->with('success', 'ส่งข้อมูลสำเร็จแล้ว กรุณารอการติดต่อจากทีมงาน');
    }
}

