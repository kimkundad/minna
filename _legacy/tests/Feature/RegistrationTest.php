<?php

namespace Tests\Feature;

use App\Models\Subject;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Database\Seeders\SubjectSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Fortify\Features;
use Laravel\Jetstream\Jetstream;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_screen_can_be_rendered(): void
    {
        if (! Features::enabled(Features::registration())) {
            $this->markTestSkipped('Registration support is not enabled.');
        }

        $response = $this->get('/register');

        $response->assertStatus(200);
    }

    public function test_registration_screen_cannot_be_rendered_if_support_is_disabled(): void
    {
        if (Features::enabled(Features::registration())) {
            $this->markTestSkipped('Registration support is enabled.');
        }

        $response = $this->get('/register');

        $response->assertStatus(404);
    }

    public function test_new_users_can_register(): void
    {
        if (! Features::enabled(Features::registration())) {
            $this->markTestSkipped('Registration support is not enabled.');
        }

        $this->seed(RoleSeeder::class);

        $payload = [
            'role' => 'student',
            'username' => 'student01',
            'first_name' => 'Test',
            'last_name' => 'Student',
            'email' => 'student@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ];

        if (Jetstream::hasTermsAndPrivacyPolicyFeature()) {
            $payload['terms'] = '1';
        }

        $response = $this->post('/register', $payload);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));

        $student = User::where('email', 'student@example.com')->first();
        $this->assertNotNull($student);
        $this->assertTrue($student->hasRole('student'));
    }

    public function test_teachers_can_register_with_subjects(): void
    {
        if (! Features::enabled(Features::registration())) {
            $this->markTestSkipped('Registration support is not enabled.');
        }

        $this->seed(RoleSeeder::class);
        $this->seed(SubjectSeeder::class);

        $subjects = Subject::pluck('id')->take(2)->all();

        $payload = [
            'role' => 'teacher',
            'username' => 'teacher01',
            'first_name' => 'Test',
            'last_name' => 'Teacher',
            'email' => 'teacher@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
            'subject_ids' => $subjects,
        ];

        if (Jetstream::hasTermsAndPrivacyPolicyFeature()) {
            $payload['terms'] = '1';
        }

        $response = $this->post('/register', $payload);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));

        $teacher = User::where('email', 'teacher@example.com')->first();
        $this->assertNotNull($teacher);
        $this->assertTrue($teacher->hasRole('teacher'));
        $this->assertEqualsCanonicalizing($subjects, $teacher->subjects()->pluck('id')->all());
    }
}
