<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::firstOrCreate(
            ['email' => 'admin@example.com'],
            [
                'username' => 'admin',
                'first_name' => 'System',
                'last_name' => 'Admin',
                'name' => 'System Admin',
                'password' => bcrypt('password123'),
            ]
        );
        $admin->syncRoles(['admin']);
    }
}
