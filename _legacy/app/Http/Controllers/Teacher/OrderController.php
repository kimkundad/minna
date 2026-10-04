<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\CourseOrder;

class OrderController extends Controller
{
    public function index()
    {
        $orders = CourseOrder::query()
            ->with(['course:id,title,teacher_id', 'user:id,name,email'])
            ->whereHas('course', fn ($q) => $q->where('teacher_id', auth()->id()))
            ->latest()
            ->paginate(20);

        return view('teacher.orders.index', compact('orders'));
    }
}
