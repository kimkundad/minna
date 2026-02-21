<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CourseOrder extends Model
{
    protected $fillable = [
        'order_no',
        'user_id',
        'course_id',
        'amount',
        'currency',
        'status',
        'qp_id',
        'payment_url',
        'res_code',
        'res_desc',
        'provider_payload',
        'paid_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'provider_payload' => 'array',
        'paid_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function course()
    {
        return $this->belongsTo(Course::class);
    }
}
