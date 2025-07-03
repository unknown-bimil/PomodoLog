# 🍅 PomodoLog

습관을 기록하고 퍼포먼스를 개선하는 행동 촉구형 뽀모도로 타이머

A habit-building, action-prompting Pomodoro timer that records your performance





## Introduction  
PomodoLog는 일정 시간 단위로 집중 작업을 돕고, 끝날 때마다 작업 내용과 퍼포먼스를 자동으로 기록하도록 유도합니다.  
PomodoLog helps you work in focused intervals and then prompts you to log what you did and how well you performed.  

- **목적(Goal)**
	- 시간을 더 효율적으로 쓰기 위해 ‘기록 → 피드백’ 루틴을 쉽게 만들고  
	- Turn “record → feedback” into an effortless daily routine  
- **가치(Benefit)**
	- 하루 작업을 습관화된 로그로 남겨, 나만의 퍼포먼스 리포트를 만들 기반을 제공합니다.
	- Build a habit of logging your tasks and performance, creating the foundation for future reports or dashboards





## Features  
| 기능                                                   | 설명 및 사용자 체감 예시                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **👀 플로팅 팝업 타이머**<br>(Floating Timer Popup)          | 작업 중에는 최소화, 휴식 시에는 크게 표시되어 눈에 쏙 들어와요.<br>Minimizes during work, maximizes during break—can’t miss it when it matters. |
| **⏰ 타이머 종료 시 기록 요청**<br>(Auto-log Prompt)            | 타이머가 끝나면 “무슨 작업했나요? 만족도는?” 팝업이 뜹니다.<br>When time’s up, a popup asks “What did you work on? How would you rate it?”    |
| **🗒 오늘 작업 로그 사이드패널**<br>(Today’s Log on Side Panel) | 사이드바에서 하루 기록을 한눈에 확인하고 복기할 수 있어요.<br>Open the sidebar to review all your logs for the day at a glance.                |
| **🌐 다국어 지원**<br>(Language Support)                  | 한국어·English                                                                                                           |





## Installation  
1. **Obsidian** → Settings → **Community Plugins** → **Browse**  
2. Search “PomodoLog” → **Install** → **Enable**





## Usage  

### Timer
![https://raw.githubusercontent.com/unknown-bimil/PomodoLog/master/imagesscreenshot_1.png](https://github.com/unknown-bimil/PomodoLog/blob/main/images/screenshot_1.png?raw=true)
- **시작(Start)**
    **시작** 버튼을 클릭하세요 (기본 25분; 설정에서 조정 가능)
    Click the **Start** button (default 25 min; adjustable in Settings)
    
- **일시정지/재개(Pause/Resume)**
    **일시정지** 버튼을 클릭해 타이머를 멈추고, **재개** 버튼을 클릭해 다시 시작하세요
    Click the **Pause** button to hold, then **Resume** to continue
        
- **정지(Stop)**
    작업을 일찍 마쳤다면 **중지** 버튼을 클릭하세요 → 즉시 기록 입력 창이 나타납니다
    Click the **Stop** button if you finish early → immediately shows the log prompt




### Performance description
![https://raw.githubusercontent.com/unknown-bimil/PomodoLog/master/imagesscreenshot_2.png](https://github.com/unknown-bimil/PomodoLog/blob/main/images/screenshot_2.png?raw=true)
1. **타이머 종료(Timer Ends)**  
	 지정된 시간이 끝나거나(혹은 사용자가 Stop 버튼을 눌러 세션을 마무리하면) 이 팝업이 자동으로 뜹니다.
	 When the PomodoLog timer reaches zero (or you stop early), this popup appears automatically.
    
2. **Describe Your Work**  
    텍스트 영역에 “무슨 작업을 했는지” 간단히 입력합니다.
    In the textarea, enter a short note about what you accomplished during the session.
    
3. **Rate Your Performance**  
    별(★) 아이콘을 클릭해 1(낮음)~5(높음) 사이로 퍼포먼스를 선택합니다.
    Click 1–5 stars to indicate how well you feel you performed.
    
4. **Save Your Log**  
    “Save” 버튼을 누르면 입력한 로그와 평점이 Markdown 로그 파일(혹은 사이드패널)에 자동으로 기록됩니다.
    Hit **Save** to append your entry and rating to your daily log (in your Markdown file and side panel).

이 화면은 사용자에게 세션 종료 후 즉시 “기록 → 피드백” 루틴을 자연스럽게 유도하도록 설계되었습니다.
This prompt is designed to make it effortless to “record → reflect,” turning each Pomodoro into actionable data for future review.




### Log data
![https://raw.githubusercontent.com/unknown-bimil/PomodoLog/master/imagesscreenshot_3.png](https://github.com/unknown-bimil/PomodoLog/blob/main/images/screenshot_3.png?raw=true)
* 작성한 Performance description은 **"Pomodoro Log.md"** 파일에 저장됩니다.
  The performance description you enter is saved to the **“Pomodoro Log.md”** file.
* 저장 경로와 파일은 설정(Settings)에서 바꿀 수 있습니다.
  You can change the save path and file name in the Settings.




### Today's log on side panel 
![https://raw.githubusercontent.com/unknown-bimil/PomodoLog/master/imagesscreenshot_4.png](https://github.com/unknown-bimil/PomodoLog/blob/main/images/screenshot_4.png?raw=true)
* 사이드 패널(Side panel)
	사이드 패널에서 위와 같은 요약 화면을 확인할 수 있습니다.
	You can check today's logs in the side panel
* **Header Bar** (Example)
	* **오늘날짜(Date):** `2025-07-03`  
	- **오늘 총업무시간(Total Focus Time):** `⏱ 344 min` (sum of all sessions)  
	- **오늘 평균 별점(Average Rating):** `★ 3.50`
- **Table**, Each row shows
	- ▶️: 작업시작 시간 (When the session began)
	- 🏁: 작업종료 시간 (When it ended)
	- ⏱️: 총작업시간(분) (Duration in minutes)
	- 📝: 작업 기록 (What you worked on)
	- ⭐: 별점 (Your self-rating)




### Settings
![https://raw.githubusercontent.com/unknown-bimil/PomodoLog/master/imagesscreenshot_5.png](https://github.com/unknown-bimil/PomodoLog/blob/main/images/screenshot_5.png?raw=true)

| Field               | Description                                                                                             | How to Change                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Work Minutes**    | 세션당 집중 시간(분)을 설정합니다. 기본값은 `25`분입니다.<br>Sets the focus duration per session, in minutes (default: `25`). | 숫자 입력란에 원하는 분 단위 값을 입력하세요.<br>Enter the desired number of minutes.                   |
| **Log File Path**   | 작업 로그를 저장할 Markdown 파일의 경로를 지정합니다.<br>Specifies the path to the Markdown file where logs are saved.     | 경로 입력란에 파일 이름과 위치를 입력하세요.<br>Type the folder path and filename.                      |
| **Select language** | 플러그인 UI 및 메시지의 언어를 선택합니다.<br>Chooses the plugin’s UI and prompt language (`English`/`한국어`).             | 드롭다운에서 **English** 또는 **한국어** 를 선택하세요.<br>Pick your language from the dropdown menu. |


## Donate - Thank you
https://buymeacoffee.com/molllab
