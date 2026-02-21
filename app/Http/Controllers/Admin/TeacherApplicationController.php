<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\TeacherApplication;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TeacherApplicationController extends Controller
{
    public function index()
    {
        $applications = TeacherApplication::query()
            ->whereIn('status', ['pending', 'rejected'])
            ->latest()
            ->paginate(15);

        return view('admin.teacher_applications.index', compact('applications'));
    }

    public function teachersIndex()
    {
        $applications = TeacherApplication::query()
            ->where('status', 'approved')
            ->latest()
            ->paginate(15);

        return view('admin.teachers.index', compact('applications'));
    }

    public function show(TeacherApplication $teacherApplication)
    {
        return view('admin.teacher_applications.show', [
            'application' => $teacherApplication,
        ]);
    }

    public function edit(TeacherApplication $teacherApplication)
    {
        return view('admin.teacher_applications.edit', [
            'application' => $teacherApplication,
        ]);
    }

    public function update(Request $request, TeacherApplication $teacherApplication)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'phone' => 'required|string|max:20',
            'subject' => 'required|string|max:255',
            'experience' => 'required|string',
            'reason' => 'nullable|string',
            'status' => 'required|in:pending,approved,rejected',
        ]);

        $createdTeacherAccount = false;
        $temporaryPassword = null;

        if ($validated['status'] !== 'pending') {
            $validated['approved_at'] = now();
            $validated['approved_by'] = $request->user()?->id;
        } else {
            $validated['approved_at'] = null;
            $validated['approved_by'] = null;
        }

        if ($validated['status'] === 'approved') {
            $teacherUser = User::query()->where('email', $validated['email'])->first();

            if (! $teacherUser) {
                $temporaryPassword = Str::random(10);
                [$firstName, $lastName] = $this->splitThaiName($validated['name']);

                $teacherUser = User::create([
                    'username' => $this->generateUniqueUsername($validated['email'], $validated['name']),
                    'name' => $validated['name'],
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $validated['email'],
                    'phone' => $validated['phone'],
                    'password' => Hash::make($temporaryPassword),
                ]);

                $createdTeacherAccount = true;
            } else {
                $teacherUser->update([
                    'name' => $validated['name'],
                    'phone' => $validated['phone'],
                ]);
            }

            if (! $teacherUser->hasRole('teacher')) {
                $teacherUser->assignRole('teacher');
            }
        }

        $teacherApplication->update($validated);

        $successMessage = 'บันทึกข้อมูลใบสมัครเรียบร้อยแล้ว';
        if ($validated['status'] === 'approved' && $createdTeacherAccount) {
            $successMessage .= ' และสร้างบัญชีผู้สอนแล้ว (อีเมล: '.$validated['email'].' | รหัสผ่านชั่วคราว: '.$temporaryPassword.')';
        } elseif ($validated['status'] === 'approved') {
            $successMessage .= ' และเปิดสิทธิ์ผู้สอนให้บัญชีที่มีอยู่แล้ว';
        }

        return redirect()
            ->route('admin.teacher_applications.show', $teacherApplication)
            ->with('success', $successMessage);
    }

    private function splitThaiName(string $fullName): array
    {
        $parts = preg_split('/\s+/u', trim($fullName)) ?: [];
        $firstName = $parts[0] ?? $fullName;
        $lastName = count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : null;

        return [$firstName, $lastName];
    }

    private function generateUniqueUsername(string $email, string $name): string
    {
        $emailPrefix = Str::before($email, '@');
        $slugFromName = Str::slug($name, '');
        $base = strtolower($emailPrefix ?: $slugFromName ?: 'teacher');
        $base = preg_replace('/[^a-z0-9_]/', '', $base) ?: 'teacher';
        $base = Str::limit($base, 40, '');

        $username = $base;
        $counter = 1;

        while (User::query()->where('username', $username)->exists()) {
            $username = Str::limit($base, 36, '').$counter;
            $counter++;
        }

        return $username;
    }
}
