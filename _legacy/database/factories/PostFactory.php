<?php

namespace Database\Factories;

use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Post>
 */
class PostFactory extends Factory
{
    protected $model = Post::class;

    public function definition(): array
    {
        $title = fake()->sentence(6);
        $adminId = User::role('admin')->inRandomOrder()->value('id') ?? User::query()->value('id');

        return [
            'title' => $title,
            'slug' => Str::slug($title) . '-' . fake()->unique()->numberBetween(100, 999),
            'excerpt' => fake()->sentence(18),
            'cover_path' => null,
            'content_html' => '<p>' . fake()->paragraphs(3, true) . '</p>',
            'status' => fake()->randomElement(['draft', 'published']),
            'published_at' => now()->subDays(fake()->numberBetween(1, 30)),
            'created_by' => $adminId,
            'updated_by' => $adminId,
        ];
    }
}

