<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DashboardController extends Controller
{
    public function profile()
    {
        return view('student.profile');
    }

    public function courses()
    {
        return view('student.courses');
    }

    public function editProfile()
    {
        return view('student.edit-profile');
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $request->merge([
            'phone_national' => preg_replace('/\D+/', '', (string) $request->input('phone_national')),
        ]);

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'phone_country_code' => ['required', 'string', 'max:8'],
            'phone_national' => ['required', 'digits_between:8,15'],
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'birth_day' => ['nullable', 'integer', 'between:1,31'],
            'birth_month' => ['nullable', 'integer', 'between:1,12'],
            'birth_year' => ['nullable', 'integer', 'between:2400,2600'],
        ]);

        $birthdate = null;
        if ($request->filled('birth_day') || $request->filled('birth_month') || $request->filled('birth_year')) {
            if (!($request->filled('birth_day') && $request->filled('birth_month') && $request->filled('birth_year'))) {
                throw ValidationException::withMessages([
                    'birth_day' => 'กรุณากรอกวันเกิดให้ครบ วัน/เดือน/ปี',
                ]);
            }

            $gregorianYear = (int) $validated['birth_year'] - 543;
            $formatted = sprintf('%04d-%02d-%02d', $gregorianYear, (int) $validated['birth_month'], (int) $validated['birth_day']);
            $isValidDate = checkdate((int) $validated['birth_month'], (int) $validated['birth_day'], $gregorianYear);

            if (!$isValidDate) {
                throw ValidationException::withMessages([
                    'birth_day' => 'วันเกิดไม่ถูกต้อง',
                ]);
            }

            $birthdate = $formatted;
        }

        $fullName = trim($validated['first_name'] . ' ' . $validated['last_name']);

        $payload = [
            'email' => $validated['email'],
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'name' => $fullName,
            'birthdate' => $birthdate,
            'phone_country_code' => $validated['phone_country_code'],
            'phone_national' => $validated['phone_national'],
            'phone' => $validated['phone_country_code'] . $validated['phone_national'],
        ];

        if (Schema::hasColumn('users', 'gender')) {
            $payload['gender'] = $validated['gender'] ?? null;
        }

        $user->forceFill($payload)->save();

        return redirect()->route('student.index')->with('status', 'บันทึกข้อมูลเรียบร้อยแล้ว');
    }

    public function editPassword()
    {
        return view('student.change-password');
    }

    public function updatePassword(Request $request)
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed', 'regex:/[a-zA-Z]/', 'regex:/[0-9]/'],
        ], [
            'password.regex' => 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข',
        ]);

        $user = $request->user();

        if (!Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'รหัสผ่านเก่าไม่ถูกต้อง',
            ]);
        }

        $user->update([
            'password' => Hash::make($validated['password']),
        ]);

        return redirect()->route('student.password.edit')->with('status', 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
    }
}
