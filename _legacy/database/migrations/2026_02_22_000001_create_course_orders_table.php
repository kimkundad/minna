<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_no', 64)->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 10, 2);
            $table->string('currency', 3)->default('THB');
            $table->string('status', 30)->default('pending');
            $table->string('qp_id', 64)->nullable()->index();
            $table->string('payment_url')->nullable();
            $table->string('res_code', 20)->nullable();
            $table->string('res_desc')->nullable();
            $table->json('provider_payload')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'course_id']);
            $table->index(['course_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_orders');
    }
};
