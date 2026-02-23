<?php

use App\Http\Controllers\Admin\CourseCategoryController as AdminCourseCategoryController;
use App\Http\Controllers\Admin\CourseController as AdminCourseController;
use App\Http\Controllers\Admin\CourseVideoController as AdminCourseVideoController;
use App\Http\Controllers\Admin\ContactMessageController as AdminContactMessageController;
use App\Http\Controllers\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Admin\EnrollmentController as AdminEnrollmentController;
use App\Http\Controllers\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Admin\StudentController;
use App\Http\Controllers\Admin\SubjectController as AdminSubjectController;
use App\Http\Controllers\Admin\SiteSettingController as AdminSiteSettingController;
use App\Http\Controllers\Admin\TeacherApplicationController as AdminTeacherApplicationController;
use App\Http\Controllers\Admin\PostController as AdminPostController;
use App\Http\Controllers\Admin\TestimonialController as AdminTestimonialController;
use App\Http\Controllers\Auth\PrivacyConsentController;
use App\Http\Controllers\Auth\RedirectController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PostController;
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
use App\Models\ContactMessage;
use App\Models\Post;
use App\Models\Subject;
use App\Models\Testimonial;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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

    $posts = Post::query()
        ->published()
        ->latest('published_at')
        ->take(3)
        ->get();

    $testimonials = Testimonial::query()
        ->published()
        ->orderBy('sort_order')
        ->latest('id')
        ->get();

    return view('welcome', compact('subjects', 'posts', 'testimonials'));
})->name('welcome');
Route::get('/blog', [PostController::class, 'index'])->name('posts.index');
Route::get('/blog/{post:slug}', [PostController::class, 'show'])->name('posts.show');
Route::get('/contact', function () {
    $first = random_int(1, 9);
    $second = random_int(1, 9);
    session([
        'contact_captcha_answer' => $first + $second,
        'contact_captcha_question' => $first . ' + ' . $second,
    ]);

    return view('contact', [
        'captchaQuestion' => session('contact_captcha_question'),
    ]);
})->name('contact');
Route::post('/contact', function (Request $request) {
    $request->validate([
        'name' => ['required', 'string', 'max:255'],
        'email' => ['required', 'email', 'max:255'],
        'subject' => ['required', 'string', 'max:255'],
        'message' => ['nullable', 'string', 'max:3000'],
        'captcha_answer' => [
            'required',
            'integer',
            function (string $attribute, mixed $value, \Closure $fail) use ($request): void {
                if ((int) $value !== (int) $request->session()->get('contact_captcha_answer')) {
                    $fail('คำตอบแคปช่าไม่ถูกต้อง');
                }
            },
        ],
    ]);

    ContactMessage::query()->create([
        'name' => (string) $request->input('name'),
        'email' => (string) $request->input('email'),
        'subject' => (string) $request->input('subject'),
        'message' => $request->filled('message') ? (string) $request->input('message') : null,
    ]);

    $request->session()->forget(['contact_captcha_answer', 'contact_captcha_question']);

    return back()->with('contact_success', 'ส่งข้อความเรียบร้อยแล้ว ทีมงานจะติดต่อกลับโดยเร็วที่สุด');
})->name('contact.submit');
Route::get('/privacy-policy', function () {
    return view('privacy-policy');
})->name('privacy.policy');
Route::get('/about', function () {
    $testimonials = Testimonial::query()
        ->published()
        ->orderBy('sort_order')
        ->latest('id')
        ->get();

    return view('about', compact('testimonials'));
})->name('about');
Route::get('/course', function (Request $request) {
    $q = trim((string) $request->query('q', ''));
    $subjectId = (int) $request->query('subject_id', 0);
    $subjects = Subject::query()->orderBy('name')->get();

    $courses = Course::query()
        ->where('status', 'approved')
        ->with(['teacher', 'subject'])
        ->withCount('videos')
        ->when($subjectId > 0, fn ($query) => $query->where('subject_id', $subjectId))
        ->when($q !== '', function ($query) use ($q) {
            $query->where(function ($sub) use ($q) {
                $sub->where('title', 'like', "%{$q}%")
                    ->orWhereHas('teacher', fn ($teacher) => $teacher->where('name', 'like', "%{$q}%"))
                    ->orWhereHas('subject', fn ($subject) => $subject->where('name', 'like', "%{$q}%"));
            });
        })
        ->latest()
        ->paginate(9)
        ->withQueryString();

    return view('course', compact('courses', 'q', 'subjects', 'subjectId'));
})->name('course');

// Backward-compatible logout for old GET links.
Route::get('/logout', function (Request $request) {
    Auth::guard('web')->logout();
    $request->session()->invalidate();
    $request->session()->regenerateToken();

    return redirect('/');
});

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
    Route::get('/payments/stripe/success/{order}', [PaymentController::class, 'success'])->name('payments.stripe.success');
    Route::get('/payments/stripe/cancel/{order}', [PaymentController::class, 'cancel'])->name('payments.stripe.cancel');
});

Route::post('/stripe/webhook', [PaymentController::class, 'webhook'])
    ->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])
    ->name('payments.stripe.webhook');

Route::get('/apply-teacher', [TeacherApplicationController::class, 'create'])->name('teacher.apply');
Route::post('/apply-teacher', [TeacherApplicationController::class, 'store']);
Route::post('/subscribe', [SubscriberController::class, 'store'])->name('subscribe.store');

Route::get('/register', function () {
    return view('auth.register', [
        'subjects' => Subject::orderBy('name')->get(),
    ]);
})->middleware(['guest'])->name('register');

// Dashboard redirect by user role
Route::middleware(['auth'])->get('/dashboard', RedirectController::class)->name('dashboard');

Route::middleware(['auth'])->group(function () {
    Route::get('/privacy/accept', [PrivacyConsentController::class, 'show'])->name('privacy.accept.show');
    Route::post('/privacy/accept', [PrivacyConsentController::class, 'accept'])->name('privacy.accept.submit');
});

// Sample course page for authenticated users
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
    
    Route::get('/', [AdminDashboardController::class, 'index'])->name('index');

    Route::prefix('students')->as('students.')->group(function () {
        Route::get('/', [StudentController::class, 'index'])->name('index');
        Route::get('/{id}/edit', [StudentController::class, 'edit'])->name('edit');
        Route::delete('/{id}', [StudentController::class, 'destroy'])->name('destroy');
    });

    Route::prefix('enrollments')->as('enrollments.')->group(function () {
        Route::get('/', [AdminEnrollmentController::class, 'index'])->name('index');
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
        Route::post('/{course}/videos/sections', [AdminCourseVideoController::class, 'storeSection'])->name('videos.sections.store');
        Route::put('/{course}/videos/sections/{section}', [AdminCourseVideoController::class, 'updateSection'])->name('videos.sections.update');
        Route::delete('/{course}/videos/sections/{section}', [AdminCourseVideoController::class, 'destroySection'])->name('videos.sections.destroy');
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
        Route::get('/', [AdminOrderController::class, 'index'])->name('index');
    });

    Route::prefix('contact-messages')->as('contact_messages.')->group(function () {
        Route::get('/', [AdminContactMessageController::class, 'index'])->name('index');
    });

    Route::prefix('posts')->as('posts.')->group(function () {
        Route::get('/', [AdminPostController::class, 'index'])->name('index');
        Route::get('/create', [AdminPostController::class, 'create'])->name('create');
        Route::post('/', [AdminPostController::class, 'store'])->name('store');
        Route::get('/{post}/edit', [AdminPostController::class, 'edit'])->name('edit');
        Route::put('/{post}', [AdminPostController::class, 'update'])->name('update');
        Route::post('/upload-image', [AdminPostController::class, 'uploadImage'])->name('upload-image');
    });

    Route::prefix('testimonials')->as('testimonials.')->group(function () {
        Route::get('/', [AdminTestimonialController::class, 'index'])->name('index');
        Route::get('/create', [AdminTestimonialController::class, 'create'])->name('create');
        Route::post('/', [AdminTestimonialController::class, 'store'])->name('store');
        Route::get('/{testimonial}/edit', [AdminTestimonialController::class, 'edit'])->name('edit');
        Route::put('/{testimonial}', [AdminTestimonialController::class, 'update'])->name('update');
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
        Route::post('/{course}/videos/sections', [TeacherCourseVideoController::class, 'storeSection'])->name('videos.sections.store');
        Route::put('/{course}/videos/sections/{section}', [TeacherCourseVideoController::class, 'updateSection'])->name('videos.sections.update');
        Route::delete('/{course}/videos/sections/{section}', [TeacherCourseVideoController::class, 'destroySection'])->name('videos.sections.destroy');
    });

    Route::get('/orders', [TeacherOrderController::class, 'index'])->name('orders.index');
    Route::get('/students', [TeacherStudentController::class, 'index'])->name('students.index');
    Route::get('/settings', [TeacherSettingController::class, 'edit'])->name('settings.edit');
    Route::put('/settings', [TeacherSettingController::class, 'update'])->name('settings.update');
});

Route::middleware(['auth', 'role:student', 'privacy.accepted'])->group(function () {
    Route::get('/student', [StudentDashboardController::class, 'profile'])->name('student.index');
    Route::get('/student/courses', [StudentDashboardController::class, 'courses'])->name('student.courses');
    Route::get('/student/courses/{course}/learn', [StudentDashboardController::class, 'learn'])->name('student.courses.learn');
    Route::get('/student/courses/{course}/videos/{video}/stream', [StudentDashboardController::class, 'streamVideo'])
        ->name('student.courses.videos.stream');
    Route::post('/student/courses/{course}/videos/{video}/progress', [StudentDashboardController::class, 'saveVideoProgress'])
        ->name('student.courses.videos.progress');
    Route::get('/student/profile/edit', [StudentDashboardController::class, 'editProfile'])->name('student.profile.edit');
    Route::put('/student/profile/edit', [StudentDashboardController::class, 'updateProfile'])->name('student.profile.update');
    Route::get('/student/password', [StudentDashboardController::class, 'editPassword'])->name('student.password.edit');
    Route::put('/student/password', [StudentDashboardController::class, 'updatePassword'])->name('student.password.update');
});



