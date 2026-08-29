### k6 performance

#### :white_check_mark: employee-create

Requests **428** · failure rate **0** · p95 **485.64 ms**

| Metric | Threshold | Result |
| --- | --- | ---: |
| employee_create_success_rate | `rate>0.95` | pass |
| http_req_duration | `p(95)<6000` | pass |
| employee_create_duration | `p(95)<5000` | pass |
| http_req_failed | `rate<0.05` | pass |
| checks | `rate>0.95` | pass |
| http_req_duration{endpoint:create_employee} | `p(95)<5000` | pass |

#### :white_check_mark: employee-lifecycle

Requests **528** · failure rate **0** · p95 **486.55 ms**

| Metric | Threshold | Result |
| --- | --- | ---: |
| http_req_duration{endpoint:lifecycle_read} | `p(95)<4000` | pass |
| http_req_failed | `rate<0.05` | pass |
| http_req_duration{endpoint:lifecycle_update} | `p(95)<5000` | pass |
| http_req_duration | `p(95)<6000` | pass |
| checks | `rate>0.95` | pass |
| http_req_duration{endpoint:lifecycle_delete} | `p(95)<5000` | pass |
| http_req_duration{endpoint:lifecycle_create} | `p(95)<5000` | pass |
| lifecycle_success_rate | `rate>0.95` | pass |

#### :white_check_mark: employee-search

Requests **1040** · failure rate **0** · p95 **614.19 ms**

| Metric | Threshold | Result |
| --- | --- | ---: |
| employee_search_success_rate | `rate>0.95` | pass |
| checks | `rate>0.95` | pass |
| http_req_duration{endpoint:employee_list} | `p(95)<3500` | pass |
| http_req_duration{endpoint:employee_filter} | `p(95)<3500` | pass |
| http_req_failed | `rate<0.05` | pass |
| http_req_duration | `p(95)<4000` | pass |

#### :white_check_mark: login

Requests **432** · failure rate **0** · p95 **919.87 ms**

| Metric | Threshold | Result |
| --- | --- | ---: |
| http_req_duration{endpoint:validate} | `p(95)<5000` | pass |
| checks | `rate>0.95` | pass |
| http_req_failed | `rate<0.05` | pass |
| http_req_duration | `p(95)<5000` | pass |
| http_req_duration{endpoint:login_page} | `p(95)<4000` | pass |
| login_success_rate | `rate>0.95` | pass |

