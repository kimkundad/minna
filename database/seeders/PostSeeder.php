<?php

namespace Database\Seeders;

use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Seeder;
class PostSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('email', 'admin@example.com')->first();
        if (! $admin) {
            return;
        }

        $posts = [
            ['slug' => 'post-learning-method-1', 'title' => '5 วิธีฝึกภาษาให้เห็นผลเร็วขึ้น'],
            ['slug' => 'post-learning-method-2', 'title' => 'เทคนิคจำคำศัพท์โดยไม่ต้องท่องเยอะ'],
            ['slug' => 'post-learning-method-3', 'title' => 'เริ่มเรียนญี่ปุ่นจากศูนย์ต้องรู้อะไรบ้าง'],
            ['slug' => 'post-learning-method-4', 'title' => 'อังกฤษเพื่อการทำงาน: ประโยคที่ใช้บ่อย'],
            ['slug' => 'post-learning-method-5', 'title' => 'วางแผนอ่านสอบอย่างไรให้ไม่ล้า'],
            ['slug' => 'post-learning-method-6', 'title' => 'จัดตารางเรียนออนไลน์ให้จบคอร์สจริง'],
        ];

        foreach ($posts as $index => $postData) {
            Post::updateOrCreate(
                ['slug' => $postData['slug']],
                [
                    'title' => $postData['title'],
                    'excerpt' => 'สรุปเนื้อหาสำคัญแบบอ่านง่าย พร้อมนำไปใช้ได้ทันทีในการเรียนและการทำงาน',
                    'cover_path' => null,
                    'content_html' => '<p>บทความนี้สรุปแนวทางที่ช่วยให้เรียนภาษาได้อย่างมีประสิทธิภาพ โดยเน้นวิธีที่ลงมือทำได้จริงในชีวิตประจำวัน</p><p>คุณสามารถปรับใช้เทคนิคเหล่านี้กับทุกภาษา ไม่ว่าจะเป็นญี่ปุ่น อังกฤษ จีน หรือเยอรมัน</p>',
                    'status' => 'published',
                    'published_at' => now()->subDays(6 - $index),
                    'created_by' => $admin->id,
                    'updated_by' => $admin->id,
                ]
            );
        }
    }
}
