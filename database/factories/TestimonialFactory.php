<?php

namespace Database\Factories;

use App\Models\Testimonial;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Testimonial>
 */
class TestimonialFactory extends Factory
{
    protected $model = Testimonial::class;

    public function definition(): array
    {
        $adminId = User::role('admin')->inRandomOrder()->value('id') ?? User::query()->value('id');

        return [
            'name' => fake()->name(),
            'designation' => fake()->jobTitle(),
            'content' => fake()->sentence(25),
            'rating' => fake()->numberBetween(4, 5),
            'avatar_path' => null,
            'status' => fake()->randomElement(['draft', 'published']),
            'sort_order' => fake()->numberBetween(1, 50),
            'created_by' => $adminId,
            'updated_by' => $adminId,
        ];
    }
}

