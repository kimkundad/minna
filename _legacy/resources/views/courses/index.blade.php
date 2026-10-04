<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('รายวิชา (ตัวอย่างตาราง)') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white overflow-hidden shadow-xl sm:rounded-lg p-6">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อคอร์ส</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้สอน</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        @foreach($courses as $course)
                            <tr>
                                <td class="px-6 py-4">{{ $course['id'] }}</td>
                                <td class="px-6 py-4">{{ $course['name'] }}</td>
                                <td class="px-6 py-4">{{ $course['teacher'] }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</x-app-layout>
