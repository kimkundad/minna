<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Course extends Model
{
    protected $fillable = [
        'title',
        'description',
        'thumbnail_path',
        'sample_video_path',
        'course_category_id',
        'subject_id',
        'teacher_id',
        'price',
        'access_type',
        'access_duration_months',
        'status',
        'created_by',
        'approved_by',
        'approved_at',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
        'price' => 'decimal:2',
        'access_duration_months' => 'integer',
    ];

    public function category()
    {
        return $this->belongsTo(CourseCategory::class, 'course_category_id');
    }

    public function subject()
    {
        return $this->belongsTo(Subject::class);
    }

    public function teacher()
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function documents()
    {
        return $this->hasMany(CourseDocument::class);
    }

    public function videos()
    {
        return $this->hasMany(CourseVideo::class)->orderBy('sort_order')->orderBy('id');
    }

    public function sections()
    {
        return $this->hasMany(CourseSection::class)->orderBy('sort_order')->orderBy('id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function orders()
    {
        return $this->hasMany(CourseOrder::class);
    }
}
