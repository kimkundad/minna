<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourseDocument extends Model
{
    protected $fillable = [
        'course_id',
        'file_name',
        'file_path',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }
}
