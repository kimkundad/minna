<?php

use App\Http\Controllers\Admin\CourseCategoryController as AdminCourseCategoryController;
use App\Http\Controllers\Admin\CourseController as AdminCourseController;
use App\Http\Controllers\Admin\CourseVideoController as AdminCourseVideoController;
use App\Http\Controllers\Admin\StudentController;
use App\Http\Controllers\Admin\SubjectController as AdminSubjectController;
use App\Http\Controllers\Admin\SiteSettingController as AdminSiteSettingController;
use App\Http\Controllers\Admin\TeacherApplicationController as AdminTeacherApplicationController;
use App\Http\Controllers\Auth\PrivacyConsentController;
use App\Http\Controllers\Auth\RedirectController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\SubscriberController;
use App\Http\Controllers\Student\DashboardController as StudentDashboardController;
use App\Http\Controllers\Teacher\CourseController as TeacherCourseController;
use App\Http\Controllers\Teacher\CourseVideoController as TeacherCourseVideoController;
use App\Http\Controllers\Teacher\DashboardController as TeacherDashboardController;
use App\Http\Controllers\Teacher\OrderController as TeacherOrderController;
use App\Http\Controllers\Teacher\StudentController as TeacherStudentController;
use App\Http\Controllers\Teacher\SettingController as TeacherSettingController;
use App\Http\Controllers\TeacherApplicationController;
use App\Models\Course;
use App\Models\Subject;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    $subjects = Subject::query()
        ->with(['courses' => function ($query) {
            $query->where('status', 'approved')
                ->with('teacher')
                ->withCount('videos')
                ->latest()
                ->take(9);
        }])
        ->orderBy('name')
        ->get();

    return view('welcome', compact('subjects'));
})->name('welcome');
Route::get('/course', fn () => view('course'))->name('course');
Route::get('/courses/{course}', function (Course $course) {
    abort_unless($course->status === 'approved', 404);

    $course->load([
        'teacher',
        'subject',
        'category',
        'documents',
        'videos',
    ]);

    $relatedCourses = Course::query()
        ->where('status', 'approved')
        ->where('subject_id', $course->subject_id)
        ->whereKeyNot($course->id)
        ->latest()
        ->take(3)
        ->get();

    return view('courses.show', compact('course', 'relatedCourses'));
})->name('courses.show');

Route::middleware(['auth'])->group(function () {
    Route::get('/courses/{course}/payment', [PaymentController::class, 'show'])->name('courses.payment');
    Route::post('/courses/{course}/payment/generate', [PaymentController::class, 'generate'])->name('courses.payment.generate');
    Route::match(['get', 'post'], '/payments/2c2p/return', [PaymentController::class, 'callback'])->name('payments.2c2p.return');
});

Route::post('/payments/2c2p/webhook', [PaymentController::class, 'webhook'])
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])
    ->name('payments.2c2p.webhook');

Route::get('/apply-teacher', [TeacherApplicationController::class, 'create'])->name('teacher.apply');
Route::post('/apply-teacher', [TeacherApplicationController::class, 'store']);
Route::post('/subscribe', [SubscriberController::class, 'store'])->name('subscribe.store');

Route::get('/register', function () {
    return view('auth.register', [
        'subjects' => Subject::orderBy('name')->get(),
    ]);
})->middleware(['guest'])->name('register');

// หน้า dashboard จะ redirect ตาม role ของผู้ใช้
Route::middleware(['auth'])->get('/dashboard', RedirectController::class)->name('dashboard');

Route::middleware(['auth'])->group(function () {
    Route::get('/privacy/accept', [PrivacyConsentController::class, 'show'])->name('privacy.accept.show');
    Route::post('/privacy/accept', [PrivacyConsentController::class, 'accept'])->name('privacy.accept.submit');
});

// หน้า course ตัวอย่างสำหรับผู้ใช้ที่ล็อกอินแล้ว
Route::middleware(['auth'])->get('/courses', function () {
    $courses = [
        ['id' => 1, 'name' => 'คอร์สภาษาญี่ปุ่นเบื้องต้น', 'teacher' => 'อาจารย์ A'],
        ['id' => 2, 'name' => 'คอร์สภาษาอังกฤษเพื่อธุรกิจ', 'teacher' => 'อาจารย์ B'],
        ['id' => 3, 'name' => 'คอร์สภาษาจีนระดับกลาง', 'teacher' => 'อาจารย์ C'],
    ];

    return view('courses.index', compact('courses'));
})->name('courses.index');

// Admin Dashboard + Management Routes
Route::middleware(['auth', 'role:admin'])->prefix('administrator')->as('admin.')->group(function () {
    Route::view('/', 'admin.index')->name('index');

    Route::prefix('students')->as('students.')->group(function () {
        Route::get('/', [StudentController::class, 'index'])->name('index');
        Route::get('/{id}/edit', [StudentController::class, 'edit'])->name('edit');
        Route::delete('/{id}', [StudentController::class, 'destroy'])->name('destroy');
    });

    Route::prefix('enrollments')->as('enrollments.')->group(function () {
        Route::get('/', fn () => 'คอร์สที่ลงทะเบียน')->name('index');
    });

    Route::prefix('teacher_applications')->as('teacher_applications.')->group(function () {
        Route::get('/', [AdminTeacherApplicationController::class, 'index'])->name('index');
        Route::get('/{teacherApplication}', [AdminTeacherApplicationController::class, 'show'])->name('show');
        Route::get('/{teacherApplication}/edit', [AdminTeacherApplicationController::class, 'edit'])->name('edit');
        Route::put('/{teacherApplication}', [AdminTeacherApplicationController::class, 'update'])->name('update');
    });

    Route::prefix('teachers')->as('teachers.')->group(function () {
        Route::get('/', [AdminTeacherApplicationController::class, 'teachersIndex'])->name('index');
    });

    Route::prefix('courses')->as('courses.')->group(function () {
        Route::get('/', [AdminCourseController::class, 'index'])->name('index');
        Route::get('/create', [AdminCourseController::class, 'create'])->name('create');
        Route::post('/', [AdminCourseController::class, 'store'])->name('store');
        Route::get('/{course}/edit', [AdminCourseController::class, 'edit'])->name('edit');
        Route::put('/{course}', [AdminCourseController::class, 'update'])->name('update');

        Route::get('/{course}/videos', [AdminCourseVideoController::class, 'index'])->name('videos.index');
        Route::post('/{course}/videos', [AdminCourseVideoController::class, 'store'])->name('videos.store');
        Route::put('/{course}/videos/{video}', [AdminCourseVideoController::class, 'update'])->name('videos.update');
        Route::delete('/{course}/videos/{video}', [AdminCourseVideoController::class, 'destroy'])->name('videos.destroy');
    });

    Route::prefix('categories')->as('categories.')->group(function () {
        Route::get('/', [AdminCourseCategoryController::class, 'index'])->name('index');
        Route::post('/', [AdminCourseCategoryController::class, 'store'])->name('store');
        Route::get('/{category}/edit', [AdminCourseCategoryController::class, 'edit'])->name('edit');
        Route::put('/{category}', [AdminCourseCategoryController::class, 'update'])->name('update');
        Route::delete('/{category}', [AdminCourseCategoryController::class, 'destroy'])->name('destroy');
    });

    Route::prefix('subjects')->as('subjects.')->group(function () {
        Route::get('/', [AdminSubjectController::class, 'index'])->name('index');
        Route::post('/', [AdminSubjectController::class, 'store'])->name('store');
        Route::get('/{subject}/edit', [AdminSubjectController::class, 'edit'])->name('edit');
        Route::put('/{subject}', [AdminSubjectController::class, 'update'])->name('update');
        Route::delete('/{subject}', [AdminSubjectController::class, 'destroy'])->name('destroy');
    });

    Route::prefix('orders')->as('orders.')->group(function () {
        Route::get('/', fn () => 'คำสั่งซื้อ')->name('index');
    });

    Route::prefix('settings')->as('settings.')->group(function () {
        Route::get('/general', [AdminSiteSettingController::class, 'edit'])->name('general');
        Route::put('/general', [AdminSiteSettingController::class, 'update'])->name('general.update');
        Route::get('/payments', fn () => 'ช่องทางชำระเงิน')->name('payments');
    });
});

Route::middleware(['auth', 'role:teacher'])->prefix('teacher')->as('teacher.')->group(function () {
    Route::get('/', [TeacherDashboardController::class, 'index'])->name('index');

    Route::prefix('courses')->as('courses.')->group(function () {
        Route::get('/', [TeacherCourseController::class, 'index'])->name('index');
        Route::get('/create', [TeacherCourseController::class, 'create'])->name('create');
        Route::post('/', [TeacherCourseController::class, 'store'])->name('store');
        Route::get('/{course}/edit', [TeacherCourseController::class, 'edit'])->name('edit');
        Route::put('/{course}', [TeacherCourseController::class, 'update'])->name('update');

        Route::get('/{course}/videos', [TeacherCourseVideoController::class, 'index'])->name('videos.index');
        Route::post('/{course}/videos', [TeacherCourseVideoController::class, 'store'])->name('videos.store');
        Route::put('/{course}/videos/{video}', [TeacherCourseVideoController::class, 'update'])->name('videos.update');
        Route::delete('/{course}/videos/{video}', [TeacherCourseVideoController::class, 'destroy'])->name('videos.destroy');
    });

    Route::get('/orders', [TeacherOrderController::class, 'index'])->name('orders.index');
    Route::get('/students', [TeacherStudentController::class, 'index'])->name('students.index');
    Route::get('/settings', [TeacherSettingController::class, 'edit'])->name('settings.edit');
    Route::put('/settings', [TeacherSettingController::class, 'update'])->name('settings.update');
});

Route::middleware(['auth', 'role:student', 'privacy.accepted'])->group(function () {
    Route::get('/student', [StudentDashboardController::class, 'profile'])->name('student.index');
    Route::get('/student/courses', [StudentDashboardController::class, 'courses'])->name('student.courses');
    Route::get('/student/profile/edit', [StudentDashboardController::class, 'editProfile'])->name('student.profile.edit');
    Route::put('/student/profile/edit', [StudentDashboardController::class, 'updateProfile'])->name('student.profile.update');
    Route::get('/student/password', [StudentDashboardController::class, 'editPassword'])->name('student.password.edit');
    Route::put('/student/password', [StudentDashboardController::class, 'updatePassword'])->name('student.password.update');
});

