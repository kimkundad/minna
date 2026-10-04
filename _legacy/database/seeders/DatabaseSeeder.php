<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RoleSeeder::class,
            SubjectSeeder::class,
            AdminUserSeeder::class,
            TeacherStudentSeeder::class,
            CourseCatalogSeeder::class,
            PostSeeder::class,
            TestimonialSeeder::class,
        ]);
    }
}

