<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_videos', function (Blueprint $table) {
            $table->foreignId('course_section_id')
                ->nullable()
                ->after('course_id')
                ->constrained('course_sections')
                ->nullOnDelete();
            $table->unsignedInteger('sort_order')->default(0)->after('video_path');
            $table->index(['course_id', 'course_section_id', 'sort_order'], 'course_videos_course_section_sort_idx');
        });
    }

    public function down(): void
    {
        Schema::table('course_videos', function (Blueprint $table) {
            $table->dropIndex('course_videos_course_section_sort_idx');
            $table->dropConstrainedForeignId('course_section_id');
            $table->dropColumn('sort_order');
        });
    }
};
