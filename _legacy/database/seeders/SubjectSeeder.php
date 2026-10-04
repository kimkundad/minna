<?php

namespace Database\Seeders;

use App\Models\Subject;
use Illuminate\Database\Seeder;

class SubjectSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['ญี่ปุ่น', 'English', 'จีน', 'เยอรมัน'] as $name) {
            Subject::firstOrCreate(['name' => $name]);
        }
    }
}

