<?php

namespace Database\Seeders;

use App\Models\Testimonial;
use App\Models\User;
use Illuminate\Database\Seeder;

class TestimonialSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('email', 'admin@example.com')->first();
        if (! $admin) {
            return;
        }

        $items = [
            ['name' => 'พิมพ์ชนก ศรีสวัสดิ์', 'designation' => 'นักศึกษามหาวิทยาลัย', 'content' => 'ตอนแรกกลัวว่าจะเรียนออนไลน์ไม่เข้าใจ แต่พอเรียนจริงมีตัวอย่างชัดเจนและทบทวนย้อนหลังได้ ทำให้มั่นใจขึ้นมาก'],
            ['name' => 'ธนกฤต มณีโชติ', 'designation' => 'พนักงานบริษัทเอกชน', 'content' => 'บทเรียนแบ่งเป็นหัวข้อสั้น ๆ เข้าใจง่าย เหมาะกับคนทำงานที่มีเวลาจำกัด'],
            ['name' => 'สุพัตรา คงดี', 'designation' => 'เจ้าของกิจการ', 'content' => 'ได้ทั้งทักษะภาษาและแนวทางนำไปใช้กับงานจริง เห็นผลเร็วกว่าเรียนเองมาก'],
            ['name' => 'วรพล อินทรา', 'designation' => 'นักเรียนมัธยม', 'content' => 'อาจารย์อธิบายละเอียด มีแบบฝึกหัดให้ลองทำ ทำให้จำได้แม่นขึ้น'],
            ['name' => 'กมลชนก วัฒนา', 'designation' => 'ฟรีแลนซ์', 'content' => 'ระบบเรียนใช้งานง่ายมาก เข้าเรียนได้ทั้งมือถือและคอมพิวเตอร์'],
            ['name' => 'ปฏิภาณ ชูศักดิ์', 'designation' => 'วิศวกร', 'content' => 'คอร์สมีโครงสร้างดี เรียนตามลำดับแล้วพัฒนาขึ้นอย่างชัดเจน'],
        ];

        foreach ($items as $index => $item) {
            Testimonial::updateOrCreate(
                ['name' => $item['name']],
                [
                    'designation' => $item['designation'],
                    'content' => $item['content'],
                    'rating' => 5,
                    'avatar_path' => null,
                    'status' => 'published',
                    'sort_order' => $index + 1,
                    'created_by' => $admin->id,
                    'updated_by' => $admin->id,
                ]
            );
        }
    }
}

