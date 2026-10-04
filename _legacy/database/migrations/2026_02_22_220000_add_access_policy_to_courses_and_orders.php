<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->string('access_type', 20)->default('lifetime')->after('price');
            $table->unsignedSmallInteger('access_duration_months')->nullable()->after('access_type');
        });

        Schema::table('course_orders', function (Blueprint $table) {
            $table->string('access_type', 20)->default('lifetime')->after('status');
            $table->unsignedSmallInteger('access_duration_months')->nullable()->after('access_type');
            $table->timestamp('access_expires_at')->nullable()->after('paid_at');
            $table->index(['user_id', 'status', 'access_expires_at'], 'course_orders_user_status_exp_idx');
        });
    }

    public function down(): void
    {
        Schema::table('course_orders', function (Blueprint $table) {
            $table->dropIndex('course_orders_user_status_exp_idx');
            $table->dropColumn(['access_type', 'access_duration_months', 'access_expires_at']);
        });

        Schema::table('courses', function (Blueprint $table) {
            $table->dropColumn(['access_type', 'access_duration_months']);
        });
    }
};

