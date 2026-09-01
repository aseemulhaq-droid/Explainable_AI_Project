# Task 3 — Manual Test Checklist & PowerShell Commands

Follow these steps in order to test the full Task 3 Backend API flow on `http://localhost:8080`.

---

## Step 1: Register Step 1 (Request OTP)
```powershell
$regBody = @{
    name        = "Dr. Alice Walker"
    email       = "alice.walker@hospital.org"
    password    = "SecurePass123"
    role        = "doctor"
    institution = "Cardiff General Hospital"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/register/request-otp" -Method Post -ContentType "application/json" -Body $regBody
```
*Expected Result*: `{"success": true, "message": "Verification code sent to your email."}`  
*Note*: Check the server console log for the printed 6-digit OTP code.

---

## Step 2: Register Step 2 (Verify OTP & Create User in MySQL)
```powershell
$verifyBody = @{
    email = "alice.walker@hospital.org"
    otp   = "<INSERT_6_DIGIT_OTP_FROM_CONSOLE>"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/register/verify-otp" -Method Post -ContentType "application/json" -Body $verifyBody
```
*Expected Result*: `{"success": true, "user_id": <INT>}`

---

## Step 3: Login (Capture Session Token)
```powershell
$loginBody = @{
    email    = "alice.walker@hospital.org"
    password = "SecurePass123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "http://localhost:8080/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginRes.token
Write-Host "Logged in. Token: $token"
```
*Expected Result*: `{"success": true, "token": "...", "role": "doctor", "user_id": <INT>, "name": "Dr. Alice Walker"}`

---

## Step 4: Forgot Password — Request Reset OTP
```powershell
$forgotReqBody = @{
    email = "alice.walker@hospital.org"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/forgot-password/request-otp" -Method Post -ContentType "application/json" -Body $forgotReqBody
```
*Expected Result*: `{"success": true, "message": "If an account with that email exists, a reset code has been sent."}`  
*Note*: Check server console for the reset OTP.

---

## Step 5: Forgot Password — Reset Password
```powershell
$resetBody = @{
    email        = "alice.walker@hospital.org"
    otp          = "<INSERT_RESET_OTP_FROM_CONSOLE>"
    new_password = "BrandNewPassword456"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8080/forgot-password/reset" -Method Post -ContentType "application/json" -Body $resetBody
```
*Expected Result*: `{"success": true, "message": "Password updated successfully."}`

---

## Step 6: Verify Old Session Token is Invalidated & Old Password Fails
```powershell
# Old token request should fail with 401:
$headers = @{ Authorization = "Bearer $token" }
try {
    Invoke-RestMethod -Uri "http://localhost:8080/history" -Method Get -Headers $headers
} catch {
    Write-Host "Old token correctly rejected: $_"
}

# Old password login should fail with 401:
try {
    Invoke-RestMethod -Uri "http://localhost:8080/login" -Method Post -ContentType "application/json" -Body $loginBody
} catch {
    Write-Host "Old password login correctly rejected: $_"
}
```

---

## Step 7: Login with NEW Password
```powershell
$newLoginBody = @{
    email    = "alice.walker@hospital.org"
    password = "BrandNewPassword456"
} | ConvertTo-Json

$newLoginRes = Invoke-RestMethod -Uri "http://localhost:8080/login" -Method Post -ContentType "application/json" -Body $newLoginBody
$token = $newLoginRes.token
Write-Host "New Login Succeeded! New Token: $token"
```

---

## Step 8: Predict Endpoint (`POST /predict`)
```powershell
$headers = @{ Authorization = "Bearer $token" }
$predictBody = @{
    disease      = "diabetes"
    patient_name = "Robert Taylor"
    age          = 52
    gender       = "male"
    features     = @{
        glucose        = 185
        bmi            = 33.5
        insulin        = 210
        age            = 52
        blood_pressure = 88
        pregnancies    = 0
        skin_thickness = 32
        dpf            = 0.75
    }
} | ConvertTo-Json -Depth 5

$predictRes = Invoke-RestMethod -Uri "http://localhost:8080/predict" -Method Post -ContentType "application/json" -Headers $headers -Body $predictBody
$diagId = $predictRes.diagnosis_id
Write-Host "Prediction successful! Diagnosis ID: $diagId"
```
*Expected Result*: `{"success": true, "diagnosis_id": "D0000X", "result": "DETECTED", "confidence": ..., "risk_level": "RED"}`

---

## Step 9: Explain Endpoint (`GET /explain?id=<diagnosis_id>`)
```powershell
$headers = @{ Authorization = "Bearer $token" }
$explainRes = Invoke-RestMethod -Uri "http://localhost:8080/explain?id=$diagId" -Method Get -Headers $headers
$explainRes.lime_scores | Format-Table
```
*Expected Result*: `{"success": true, "diagnosis_id": "D0000X", "lime_scores": [...]}`

---

## Step 10: What-If Endpoint (`POST /whatif`)
```powershell
$headers = @{ Authorization = "Bearer $token" }
$whatifBody = @{
    disease  = "diabetes"
    features = @{
        glucose        = 95  # modified value (healthy range)
        bmi            = 22.0
        insulin        = 85
        age            = 52
        blood_pressure = 75
        pregnancies    = 0
        skin_thickness = 20
        dpf            = 0.4
    }
} | ConvertTo-Json -Depth 5

$whatifRes = Invoke-RestMethod -Uri "http://localhost:8080/whatif" -Method Post -ContentType "application/json" -Headers $headers -Body $whatifBody
Write-Host "What-If Result: $($whatifRes.result), Confidence: $($whatifRes.confidence)%, Risk: $($whatifRes.risk_level)"
```
*Expected Result*: `{"success": true, "result": "NOT_DETECTED", "confidence": ..., "risk_level": "SAFE", "lime_scores": [...]}`

---

## Step 11: History Endpoint (`GET /history`)
```powershell
$headers = @{ Authorization = "Bearer $token" }
$historyRes = Invoke-RestMethod -Uri "http://localhost:8080/history" -Method Get -Headers $headers
$historyRes.records | Format-Table
```
*Expected Result*: `{"success": true, "records": [...]}`

---

## Step 12: Logout (`POST /logout`)
```powershell
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:8080/logout" -Method Post -Headers $headers
```
*Expected Result*: `{"success": true}`
