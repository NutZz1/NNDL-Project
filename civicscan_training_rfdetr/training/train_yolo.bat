@echo off
REM CivicScan - YOLOv11-s baseline, 60 epochs, tuned for the RTX 4060 Laptop (8 GB).
REM
REM   resolution 576  : YOLO needs a multiple of 32; 560 crashes in the neck (35 vs 36).
REM                     576 is the nearest valid size above 560.
REM   batch 16 x 1    : effective batch 16, same as every RF-DETR run. 4.1 GB VRAM.
REM   workers 6       : with reduced JPEG decoding the loader does ~100 img/s at 6
REM                     workers, above the ~60 img/s the GPU sustains; 8 gained
REM                     nothing and pushed RAM over the edge twice (WinError 1455).
REM   from scratch    : this reimplementation has no pretrained weights.
REM
REM Expect ~8 min/epoch (6 train + 2 validation)  ->  ~8 h for 60 epochs.
REM Ctrl+C stops it; runs\yolov11_576\best.pt is always the best epoch so far.
REM A killed run resumes from last.pt automatically on the next launch.

cd /d "%~dp0"
if not exist runs\yolov11_576 mkdir runs\yolov11_576

REM Auto-resume: if a previous attempt left a last.pt, continue from it
REM (same weights, optimizer, schedule position, log) instead of restarting.
set RESUME=
if exist runs\yolov11_576\last.pt (
    set RESUME=--resume
    echo Resuming from runs\yolov11_576\last.pt
)

"C:\Users\sreep\OneDrive\Desktop\NNDL-CivicScan\civicscan-model\.venv\Scripts\python.exe" -u scripts\train.py ^
    --config configs\yolov11.yaml ^
    --run-dir runs\yolov11_576 ^
    --resolution 576 ^
    --batch 16 --accum 1 ^
    --workers 6 ^
    --epochs 60 %RESUME% ^
    2>&1 | "C:\Program Files\Git\usr\bin\tee.exe" runs\yolov11_576\console.log

echo.
echo TRAINING PROCESS EXITED
pause
