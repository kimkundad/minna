<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourseVideoProgress extends Model
{
    protected $table = 'course_video_progresses';

    protected $fillable = [
        'user_id',
        'course_id',
        'course_video_id',
        'last_position_seconds',
        'duration_seconds',
        'last_watched_at',
        'completed_at',
    ];

    protected $casts = [
        'last_watched_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function video()
    {
        return $this->belongsTo(CourseVideo::class, 'course_video_id');
    }
}
