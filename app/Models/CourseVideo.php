<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourseVideo extends Model
{
    protected $fillable = [
        'course_id',
        'video_title',
        'content_name',
        'duration',
        'description',
        'video_path',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }
}
