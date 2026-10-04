<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class TeacherStudentSeeder extends Seeder
{
    public function run(): void
    {
        $teachers = [
            [
                'email' => 'teacher1@example.com',
                'username' => 'teacher1',
                'first_name' => 'Kenji',
                'last_name' => 'Sato',
                'name' => 'Kenji Sato',
                'phone' => '+66950000001',
                'phone_country_code' => '+66',
                'phone_national' => '950000001',
            ],
            [
                'email' => 'teacher2@example.com',
                'username' => 'teacher2',
                'first_name' => 'Lina',
                'last_name' => 'Chen',
                'name' => 'Lina Chen',
                'phone' => '+66950000002',
                'phone_country_code' => '+66',
                'phone_national' => '950000002',
            ],
            [
                'email' => 'teacher3@example.com',
                'username' => 'teacher3',
                'first_name' => 'David',
                'last_name' => 'Muller',
                'name' => 'David Muller',
                'phone' => '+66950000003',
                'phone_country_code' => '+66',
                'phone_national' => '950000003',
            ],
        ];

        foreach ($teachers as $data) {
            $teacher = User::updateOrCreate(
                ['email' => $data['email']],
                array_merge($data, [
                    'password' => Hash::make('password123'),
                    'email_verified_at' => now(),
                    'privacy_accepted_at' => now(),
                ])
            );
            $teacher->syncRoles(['teacher']);
        }

        $students = [
            [
                'email' => 'student1@example.com',
                'username' => 'student1',
                'first_name' => 'Somchai',
                'last_name' => 'Jaidee',
                'name' => 'Somchai Jaidee',
                'phone' => '+66951111101',
                'phone_country_code' => '+66',
                'phone_national' => '951111101',
            ],
            [
                'email' => 'student2@example.com',
                'username' => 'student2',
                'first_name' => 'Mali',
                'last_name' => 'Wong',
                'name' => 'Mali Wong',
                'phone' => '+66951111102',
                'phone_country_code' => '+66',
                'phone_national' => '951111102',
            ],
            [
                'email' => 'student3@example.com',
                'username' => 'student3',
                'first_name' => 'Arun',
                'last_name' => 'Khan',
                'name' => 'Arun Khan',
                'phone' => '+66951111103',
                'phone_country_code' => '+66',
                'phone_national' => '951111103',
            ],
        ];

        foreach ($students as $data) {
            $student = User::updateOrCreate(
                ['email' => $data['email']],
                array_merge($data, [
                    'password' => Hash::make('password123'),
                    'email_verified_at' => now(),
                    'privacy_accepted_at' => now(),
                ])
            );
            $student->syncRoles(['student']);
        }
    }
}

