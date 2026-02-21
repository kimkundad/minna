<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TeacherApplication extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'subject',
        'experience',
        'reason',
        'resume_path',
        'status',
        'approved_at',
        'approved_by',
    ];

    protected $casts = [
        'approved_at' => 'datetime',
    ];

    // ความสัมพันธ์กับ User ที่อนุมัติ
    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
