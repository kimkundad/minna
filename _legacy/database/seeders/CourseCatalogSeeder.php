<?php

namespace Database\Seeders;

use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\CourseDocument;
use App\Models\CourseSection;
use App\Models\CourseVideo;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Database\Seeder;

class CourseCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $categories = collect([
            'ไวยากรณ์',
            'บทสนทนา',
            'สอบวัดระดับ',
            'คำศัพท์',
            'การอ่าน',
            'การฟัง',
        ])->map(fn (string $name) => CourseCategory::firstOrCreate(['name' => $name]));

        $subjects = Subject::query()->orderBy('id')->get();
        $teachers = User::role('teacher')->orderBy('id')->get();
        $admin = User::where('email', 'admin@example.com')->first();

        if ($subjects->isEmpty() || $teachers->isEmpty() || ! $admin) {
            return;
        }

        $courseTemplates = [
            ['title' => 'JLPT N5 พื้นฐานภาษาญี่ปุ่น', 'price' => 1290],
            ['title' => 'English Conversation for Work', 'price' => 990],
            ['title' => 'ภาษาจีนเพื่อการสื่อสารระดับต้น', 'price' => 1190],
            ['title' => 'German A1 เริ่มจากศูนย์', 'price' => 1390],
            ['title' => 'เทคนิคการอ่านบทความภาษาต่างประเทศ', 'price' => 890],
            ['title' => 'เร่งสปีดคำศัพท์ใช้ได้จริง', 'price' => 790],
        ];

        foreach ($courseTemplates as $index => $template) {
            $subject = $subjects[$index % $subjects->count()];
            $teacher = $teachers[$index % $teachers->count()];
            $category = $categories[$index % $categories->count()];

            $course = Course::updateOrCreate(
                ['title' => $template['title']],
                [
                    'description' => 'คอร์สนี้ออกแบบสำหรับผู้เริ่มต้นจนถึงระดับกลาง เน้นการใช้งานจริงพร้อมแบบฝึกหัดและตัวอย่างที่นำไปใช้ได้ทันที',
                    'course_category_id' => $category->id,
                    'subject_id' => $subject->id,
                    'teacher_id' => $teacher->id,
                    'price' => $template['price'],
                    'access_type' => $index % 2 === 0 ? 'lifetime' : 'time_limited',
                    'access_duration_months' => $index % 2 === 0 ? null : [1, 2, 3, 6, 12][$index % 5],
                    'status' => 'approved',
                    'created_by' => $admin->id,
                    'approved_by' => $admin->id,
                    'approved_at' => now(),
                    'thumbnail_path' => null,
                    'sample_video_path' => null,
                ]
            );

            $introSection = CourseSection::updateOrCreate(
                ['course_id' => $course->id, 'title' => 'แนะนำคอร์ส'],
                ['sort_order' => 1]
            );

            $mainSection = CourseSection::updateOrCreate(
                ['course_id' => $course->id, 'title' => 'บทเรียนหลัก'],
                ['sort_order' => 2]
            );

            $videos = [
                [$introSection, 'ภาพรวมคอร์ส', 'เริ่มต้นเข้าใจโครงสร้างบทเรียน', '08:30', 1],
                [$introSection, 'ตั้งเป้าหมายการเรียน', 'วิธีวางแผนเรียนให้จบคอร์ส', '10:15', 2],
                [$mainSection, 'บทเรียนที่ 1', 'เนื้อหาหลักบทที่ 1 พร้อมตัวอย่าง', '15:20', 1],
                [$mainSection, 'บทเรียนที่ 2', 'เนื้อหาหลักบทที่ 2 พร้อมแบบฝึกหัด', '17:40', 2],
            ];

            foreach ($videos as [$section, $title, $contentName, $duration, $sortOrder]) {
                CourseVideo::updateOrCreate(
                    [
                        'course_id' => $course->id,
                        'course_section_id' => $section->id,
                        'video_title' => $title,
                    ],
                    [
                        'content_name' => $contentName,
                        'duration' => $duration,
                        'description' => 'วิดีโอตัวอย่างสำหรับทดสอบระบบจัดการบทเรียน',
                        'video_path' => 'seed/videos/demo-video.mp4',
                        'sort_order' => $sortOrder,
                    ]
                );
            }

            CourseDocument::updateOrCreate(
                [
                    'course_id' => $course->id,
                    'file_name' => 'เอกสารประกอบบทเรียน.pdf',
                ],
                [
                    'file_path' => 'seed/documents/course-material.pdf',
                ]
            );
        }
    }
}

