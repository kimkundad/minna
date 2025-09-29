<?php

use App\Models\Subject;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
})->name('welcome');

Route::middleware([
    'auth:sanctum',
    config('jetstream.auth_session'),
    'verified',
])->group(function () {
    Route::get('/dashboard', function () {
        return view('dashboard');
    })->name('dashboard');
});

Route::get('/register', function () {
    return view('auth.register', [
        'subjects' => Subject::orderBy('name')->get(),
    ]);
})->middleware(['guest'])->name('register');

Route::middleware(['auth:sanctum', config('jetstream.auth_session'), 'verified'])->group(function () {

    Route::view('/dashboard', 'dashboard')->name('dashboard');

    // ✅ เพิ่มตรงนี้
    Route::get('/courses', function () {
        $courses = [
            ['id' => 1, 'name' => 'คอร์สภาษาญี่ปุ่นเบื้องต้น', 'teacher' => 'อาจารย์ A'],
            ['id' => 2, 'name' => 'คอร์สภาษาอังกฤษเพื่อธุรกิจ', 'teacher' => 'อาจารย์ B'],
            ['id' => 3, 'name' => 'คอร์สภาษาจีนระดับกลาง', 'teacher' => 'อาจารย์ C'],
        ];
        return view('courses.index', compact('courses'));
    })->name('courses.index');
    // ✅ จบเพิ่ม

    Route::middleware('role:admin')->group(function () {
        Route::view('/admin', 'admin.index')->name('admin.index');
        // เส้นทางจัดการผู้ใช้/คอร์สทั้งหมด ฯลฯ
    });

    Route::middleware('role:teacher')->group(function () {
        Route::view('/teacher', 'teacher.index')->name('teacher.index');
        // สร้าง/จัดการคอร์สของครู
    });

    Route::middleware('role:student')->group(function () {
        Route::view('/student', 'student.index')->name('student.index');
        // สมัครเรียน/ดูคอร์สที่ลงทะเบียน
    });
});
