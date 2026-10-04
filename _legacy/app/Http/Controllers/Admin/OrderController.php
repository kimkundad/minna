<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CourseOrder;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        $status = trim((string) $request->query('status', ''));

        $orders = CourseOrder::query()
            ->with(['user', 'course.teacher'])
            ->when($q !== '', function ($query) use ($q) {
                $query->where(function ($sub) use ($q) {
                    $sub->where('order_no', 'like', "%{$q}%")
                        ->orWhereHas('user', function ($u) use ($q) {
                            $u->where('name', 'like', "%{$q}%")
                                ->orWhere('email', 'like', "%{$q}%");
                        })
                        ->orWhereHas('course', function ($c) use ($q) {
                            $c->where('title', 'like', "%{$q}%")
                                ->orWhereHas('teacher', function ($t) use ($q) {
                                    $t->where('name', 'like', "%{$q}%");
                                });
                        });
                });
            })
            ->when($status !== '', fn ($query) => $query->where('status', $status))
            ->latest()
            ->paginate(20)
            ->withQueryString();

        $statuses = CourseOrder::query()
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status');

        return view('admin.orders.index', compact('orders', 'q', 'status', 'statuses'));
    }
}

