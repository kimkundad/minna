<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\CreatesNewUsers;
use Laravel\Jetstream\Jetstream;

use Spatie\Permission\Models\Role;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            // 'role'       => ['required', 'in:teacher,student'],
            'username'   => ['required','string','max:50','alpha_dash','unique:users,username'],
            'first_name' => ['required','string','max:100'],
            'last_name'  => ['required','string','max:100'],
            'birthdate'  => ['nullable','date'],
            'phone'      => ['nullable','string','max:30'],
            'address'    => ['nullable','string','max:255'],
            'line_id'    => ['nullable','string','max:100'],

            'name'       => ['sometimes'], // Jetstream ต้องการ แต่เราจะประกอบเอง
            'email'      => ['required','string','email','max:255','unique:users'],
            'password'   => $this->passwordRules(),
            'terms'      => Jetstream::hasTermsAndPrivacyPolicyFeature() ? ['accepted', 'required'] : '',
            'subject_ids'=> ['array'],
            'subject_ids.*' => ['integer','exists:subjects,id'],
        ])->validate();

        $user = User::create([
            'username'   => $input['username'],
            'first_name' => $input['first_name'],
            'last_name'  => $input['last_name'],
            'name'       => trim($input['first_name'].' '.$input['last_name']),
            'birthdate'  => $input['birthdate'] ?? null,
            'phone'      => $input['phone'] ?? null,
            'address'    => $input['address'] ?? null,
            'line_id'    => $input['line_id'] ?? null,
            'email'      => $input['email'],
            'password'   => Hash::make($input['password']),
        ]);

        // กำหนดบทบาท
        $user->assignRole('student');

        // // ถ้าเป็นครู ผูกวิชาที่สอน
        // if ($input['role'] === 'teacher' && !empty($input['subject_ids'])) {
        //     $user->subjects()->sync($input['subject_ids']);
        // }

        return $user;
    }
}
