<?php

namespace Database\Factories;

use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Course>
 */
class CourseFactory extends Factory
{
    protected $model = Course::class;

    public function definition(): array
    {
        $categoryId = CourseCategory::query()->inRandomOrder()->value('id')
            ?? CourseCategory::query()->create(['name' => 'General'])->id;

        $subjectId = Subject::query()->inRandomOrder()->value('id')
            ?? Subject::query()->create(['name' => 'English'])->id;

        $teacherId = User::role('teacher')->inRandomOrder()->value('id')
            ?? User::query()->value('id');

        $adminId = User::role('admin')->inRandomOrder()->value('id')
            ?? User::query()->value('id');

        return [
            'title' => fake()->sentence(4),
            'description' => fake()->paragraphs(3, true),
            'thumbnail_path' => null,
            'sample_video_path' => null,
            'course_category_id' => $categoryId,
            'subject_id' => $subjectId,
            'teacher_id' => $teacherId,
            'price' => fake()->numberBetween(500, 2500),
            'access_type' => fake()->randomElement(['lifetime', 'time_limited']),
            'access_duration_months' => fake()->randomElement([null, 1, 2, 3, 6, 12]),
            'status' => 'approved',
            'created_by' => $adminId,
            'approved_by' => $adminId,
            'approved_at' => now(),
        ];
    }
}
