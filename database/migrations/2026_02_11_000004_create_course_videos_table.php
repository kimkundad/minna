<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->string('video_title');
            $table->string('content_name');
            $table->string('duration');
            $table->text('description')->nullable();
            $table->string('video_path');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_videos');
    }
};
