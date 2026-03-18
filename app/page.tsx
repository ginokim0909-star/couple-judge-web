"use client"; // Next.js에서 React 훅을 쓰기 위한 필수 선언!

import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { 
  AlertTriangle, User, Image as ImageIcon, Mic, XCircle, 
  Scale, ArrowDownCircle, Download, MessageCircle 
} from 'lucide-react';

const SERVER_URL = 'https://yeon-server.vercel.app/api/judge'; // 사장님의 Vercel 서버 주소

export default function Home() {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [audios, setAudios] = useState<File[]>([]);
  const [myGender, setMyGender] = useState<'남자' | '여자'>('여자');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [result, setResult] = useState<any>(null);
  
  const resultRef = useRef<HTMLDivElement>(null);

  // 1. 이미지 업로드 & 미리보기 (최대 2장)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      if (images.length + filesArray.length > 2) {
        alert('카톡 캡처는 최대 2장까지만 제보 가능합니다.');
        return;
      }
      const newImages = filesArray.map(file => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setImages(prev => [...prev, ...newImages]);
    }
    e.target.value = ''; // 같은 파일 다시 선택 가능하게 초기화
  };

  // 2. 오디오 업로드 (1분 이내 권장)
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 2.5 * 1024 * 1024) {
        alert('음성 파일은 1분 이내(약 2.5MB 이하)만 제보 가능합니다.');
        return;
      }
      setAudios(prev => [...prev, file]);
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };
  const removeAudio = (index: number) => {
    setAudios(prev => prev.filter((_, i) => i !== index));
  };

  // 💡 웹 전용: 이미지를 800px로 줄이고 압축하는 함수 (앱의 ImageManipulator 역할)
  const resizeAndCompressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
          canvas.height = img.width > MAX_WIDTH ? img.height * scaleSize : img.height;
          
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          // base64로 70% 압축하여 반환
          resolve(canvas.toDataURL('image/jpeg', 0.7)); 
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // 3. 음성 파일 텍스트 변환 (Whisper API 호출)
  const transcribeAudio = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${SERVER_URL}?mode=transcribe`, {
      method: 'POST',
      headers: { 'x-app-secret': 'yeon-judge-super-secret-2024' },
      body: formData,
    });
    const data = await response.json();
    if (data.error) throw new Error(`음성 해독 실패: ${data.error.message}`);
    return data.text;
  };

  // 4. 메인 판결 로직
  const handleJudge = async () => {
    if (!content.trim() && images.length === 0 && audios.length === 0) {
      alert('블랙박스(캡처, 녹음, 상황 설명)를 하나라도 제보해주세요!');
      return;
    }

    // 🚨 웹 버전 임시 가짜 광고 딜레이 (나중에 구글 애드센스 전면 광고로 교체할 부분)
    // 💰 수익 극대화를 위한 가변 딜레이 적용 (광고 노출 시간 확보)
    setLoading(true);
    
    let delayTime = 3000; // 기본 3초 (텍스트만 있을 때)
    if (images.length > 0) delayTime += 3000; // 사진 있으면 +3초 (총 6초)
    if (audios.length > 0) delayTime += 4000; // 음성 있으면 +4초 (총 7~10초)

    setLoadingText('블랙박스 데이터를 서버로 안전하게 전송 중...');
    await new Promise(resolve => setTimeout(resolve, delayTime)); // 설정된 시간만큼 대기

    setResult(null);

    try {
      const userMessageContent: any[] = [];
      
      if (content.trim()) {
        userMessageContent.push({ type: "text", text: "상황 설명: " + content });
      }

      if (audios.length > 0) {
        setLoadingText('녹취록 해독 및 화법 분석 중...');
        let allTranscripts = "--- [녹취록 데이터] ---\n";
        for (let i = 0; i < audios.length; i++) {
          const text = await transcribeAudio(audios[i]);
          allTranscripts += `녹음파일 ${i + 1}: ${text}\n`;
        }
        userMessageContent.push({ type: "text", text: allTranscripts });
      }

      if (images.length > 0) {
        setLoadingText('카톡 대화 뉘앙스 분석 중...');
        for (const imgObj of images) {
          const base64Image = await resizeAndCompressImage(imgObj.file);
          userMessageContent.push({
            type: "image_url",
            image_url: { url: base64Image, detail: "high" }
          });
        }
      }

      setLoadingText('연문철 판결문 작성 중...');
      const isComplex = images.length > 0 || audios.length > 0;
      const selectedModel = isComplex ? 'gpt-4o' : 'gpt-4o-mini';

      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-app-secret': 'yeon-judge-super-secret-2024'
        },
        body: JSON.stringify({
          model: selectedModel,
          response_format: { type: "json_object" },
          messages: [
            { 
              role: 'system', 
              content: `너는 대한민국 최고의 연애 전문 재판장 '연문철'이야. 블랙박스(카톡, 녹취)를 보고 과실 비율을 냉정하게 판독하는 게 네 역할이지. 제보자(본인)의 성별은 '${myGender}'야.

              [👨‍⚖️ 연문철 재판장의 말투 및 분석 지침]
              1. 기면 기고 아니면 아니다, 단호하고 확신에 찬 말투를 써라. ("~입니다", "~하셨네요", "이건 명백한 잘못이죠")
              2. 뻔히 보이는 가스라이팅, 회피형 태도, 수동 공격성, 비꼬기, 잠수 등에 대해서는 뼈를 때리는 팩트폭격을 날려라.
              3. 제보자라고 해서 무조건 편들어주지 마라. 제보자가 잘못했으면 "제보자님, 이건 아니죠!"라며 더 혼내라.
              4. 억울한 점은 확실하게 공감해주되, 감정에 치우치지 말고 '증거' 기반으로 말해라.
              
              반드시 아래 JSON 형식에 맞춰서, 각 항목의 내용을 '연문철이 직접 말하는 듯한 구어체'로 작성해:
              {
                "ratio_male": (남자 과실 비율, 0~100 숫자. 반드시 5% 단위로 떨어지게 계산할 것! 예: 35, 45, 85. 매번 40:60 같은 비율말고도, 잘잘못을 제대로 따져서 35:65, 15:85, 20:80등 과감하고 다양한 비율을 도출할 것.합쳐서 100이 되도록),
                "ratio_female": (여자 과실 비율, 0~100 숫자. 5% 단위로 계산하며 남자 비율과 합쳐서 100이 되도록),
                "summary": "블랙박스 확인 결과... (한숨) 한 줄로 요약하자면 이렇습니다. (기가 차거나 단호한 한 줄 요약)",
                "male_fault": "남자분, 지금 이게 맞다고 생각하십니까? (구체적인 행동 팩트 폭격)",
                "male_attitude": "대화하시는 거 보니까 (비아냥/회피/말 끊기 등) 태도가 아주 안 좋습니다. (태도 지적)",
                "male_sad": "물론 남자분 입장에서는 이런 부분은 참 억울할 만합니다. (공감 1스푼),(하지만 너무 잘못이 크면 '공감할게 없습니다'라고 단호하게 말해도 됨)",
                "female_fault": "여자분도 잘한 거 없습니다. (구체적인 행동 팩트 폭격)",
                "female_attitude": "여자분 말투 보세요. 상대방 피 말리는 화법입니다. (태도 지적)",
                "female_sad": "그래도 여자분이 이 포인트에서 상처받은 건 인정합니다. (공감 1스푼),(하지만 너무 잘못이 크면 '공감할게 없습니다'라고 단호하게 말해도 됨)",
                "solution": "자, 연문철의 최종 솔루션 나갑니다. (명쾌하고 현실적인 조언, 헤어지라고 할 땐 단호하게)"
              }` 
            },
            { role: 'user', content: userMessageContent }
          ]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      setResult(JSON.parse(data.choices[0].message.content));
    } catch (error: any) {
      alert(`판결 중 문제가 발생했습니다.\n${error.message}`);
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // 5. 이미지 저장 로직 (웹 전용)
  const handleSaveImage = async () => {
  if (!resultRef.current) return;
  
  try {
    const canvas = await html2canvas(resultRef.current, {
      useCORS: true, // 💡 외부 이미지 허용 옵션
      allowTaint: true,
      backgroundColor: '#000000', // 배경색을 검정으로 강제
      scale: 2 // 화질을 2배로 선명하게
    });
    
    const image = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = image;
    link.download = `연문철_판결문_${new Date().getTime()}.png`;
    link.click();
  } catch (err) {
    console.error("이미지 저장 실패:", err);
    alert("이미지 저장 중 오류가 발생했습니다. 화면을 캡처해서 사용해 주세요!");
  }
};

  // 6. 웹 공유 로직 (모바일 브라우저에서 카톡 공유 등 지원)
  const handleShare = async () => {
  if (!result) return;

  // 💡 사장님의 진짜 주소로 고쳐주세요!
  const siteUrl = "https://couple-judge-web.vercel.app"; 

  const shareMessage = `[🚨 연문철의 연애 블랙박스 판결 결과]

과실 비율: 남자 ${result.ratio_male}% vs 여자 ${result.ratio_female}%

💡 판결 요약:
${result.summary}

⚖️ 연문철의 최종 솔루션:
${result.solution}

👇 나도 판결받으러 가기 (무료)
${siteUrl}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: '연문철의 연애 블랙박스',
        text: shareMessage,
        url: siteUrl,
      });
    } else {
      await navigator.clipboard.writeText(shareMessage);
      alert('판결문과 사이트 주소가 복사되었습니다! 카톡에 붙여넣으세요.');
    }
  } catch (error) {
    console.log('공유 실패:', error);
  }
};

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans selection:bg-[#FFD60A] selection:text-black">
      <main className="max-w-md md:max-w-2xl lg:max-w-3xl mx-auto p-5 pt-10 pb-20">
        
        {/* 타이틀 */}
        <div className="flex items-center justify-center mb-2">
          <AlertTriangle className="text-[#FFD60A] w-8 h-8 mr-2" />
          <h1 className="text-3xl font-black">연문철 블랙박스</h1>
        </div>
        <p className="text-center text-gray-400 text-sm mb-8">과실 비율부터 말투까지, 냉철하게 따져드립니다.</p>

        {/* 성별 선택 */}
        <div className="bg-[#1E1E1E] border border-[#333] p-4 rounded-xl mb-4 text-center">
          <p className="text-sm font-bold text-gray-400 mb-3">제보자(본인)의 성별</p>
          <div className="flex gap-2">
            <button 
              onClick={() => setMyGender('남자')}
              className={`flex-1 flex items-center justify-center py-3 rounded-lg font-bold transition-colors ${myGender === '남자' ? 'bg-[#4A90E2] text-white' : 'bg-[#2A2A2A] text-gray-400'}`}
            >
              <User className="w-4 h-4 mr-2" /> 남자
            </button>
            <button 
              onClick={() => setMyGender('여자')}
              className={`flex-1 flex items-center justify-center py-3 rounded-lg font-bold transition-colors ${myGender === '여자' ? 'bg-[#E94E77] text-white' : 'bg-[#2A2A2A] text-gray-400'}`}
            >
              <User className="w-4 h-4 mr-2" /> 여자
            </button>
          </div>
        </div>

        {/* 파일 첨부 버튼 (웹 input) */}
        <div className="flex gap-2 mb-2">
          <label className="flex-1 flex items-center justify-center bg-[#1E1E1E] border border-[#333] py-3 rounded-lg cursor-pointer hover:bg-[#2A2A2A] transition-colors">
            <ImageIcon className="text-[#FFD60A] w-5 h-5 mr-2" />
            <span className="text-gray-200 font-bold text-sm">카톡 캡처</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          </label>
          <label className="flex-1 flex items-center justify-center bg-[#1E1E1E] border border-[#333] py-3 rounded-lg cursor-pointer hover:bg-[#2A2A2A] transition-colors">
            <Mic className="text-[#FFD60A] w-5 h-5 mr-2" />
            <span className="text-gray-200 font-bold text-sm">녹음 파일</span>
            <input type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
          </label>
        </div>

        {/* 💡 법적 방어막을 '꿀팁'으로 포장한 안내문 */}
        <div className="mb-4 text-[11.5px] text-gray-400 font-medium leading-relaxed bg-[#1E1E1E]/80 p-3 rounded-lg border border-[#333]">
          <p className="text-[#FFD60A] font-bold mb-1">💡 제보 꿀팁 & 주의사항</p>
          <p>• 카카오톡의 <span className="text-white font-bold">'모자이크 캡처'</span> 기능을 사용하시면 1초 만에 이름을 가릴 수 있어요!</p>
          <p>• 실명이나 불법 녹음이 포함된 결과를 무단 공유할 경우 법적 책임은 제보자에게 있습니다.</p>
        </div>

        {/* 첨부된 파일 목록 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {images.map((img, i) => (
            <div key={i} className="flex items-center bg-[#2A2A2A] border border-[#444] py-1.5 px-3 rounded-full">
              <span className="text-xs text-gray-200 font-bold max-w-[100px] truncate">캡처 {i+1}</span>
              <button onClick={() => removeImage(i)} className="ml-2 text-[#FF453A] hover:text-red-400"><XCircle className="w-4 h-4" /></button>
            </div>
          ))}
          {audios.map((aud, i) => (
            <div key={i} className="flex items-center bg-[#2A2A2A] border border-[#444] py-1.5 px-3 rounded-full">
              <span className="text-xs text-gray-200 font-bold max-w-[100px] truncate">{aud.name}</span>
              <button onClick={() => removeAudio(i)} className="ml-2 text-[#FF453A] hover:text-red-400"><XCircle className="w-4 h-4" /></button>
            </div>
          ))}
        </div>

        {/* 텍스트 입력창 */}
        <textarea
          className="w-full bg-[#1E1E1E] border border-[#333] text-white rounded-xl p-4 h-32 text-sm focus:outline-none focus:border-[#FFD60A] transition-colors mb-5 resize-none"
          placeholder="사건의 전말을 상세히 적어주세요."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* 판결 버튼 */}
        <button 
          onClick={handleJudge} 
          disabled={loading}
          className="w-full bg-[#FFD60A] text-[#121212] py-4 rounded-xl font-black text-lg hover:bg-yellow-400 transition-colors disabled:opacity-70 flex items-center justify-center shadow-lg"
        >
          {loading ? (
            <span className="animate-pulse">{loadingText}</span>
          ) : (
            '판결 시작하기'
          )}
        </button>
        <p className="text-xs text-gray-500 text-center mt-3 font-medium">※ 본 판결은 AI의 분석이므로 과몰입 금지! 재미로만 참고하세요.</p>
        <p className="text-xs text-gray-500 text-center mt-1 font-medium">※ 입력된 사진과 음성은 판결 즉시 파기되며 서버에 절대 저장되지 않습니다.</p>

        {/* 완료 안내 */}
        {result && !loading && (
          <div className="mt-4 flex items-center justify-center p-3 bg-yellow-500/10 border border-[#FFD60A] rounded-lg text-[#FFD60A]">
            <ArrowDownCircle className="w-5 h-5 mr-2 animate-bounce" />
            <span className="font-bold text-sm">판결 완료! 밑으로 스크롤하세요</span>
          </div>
        )}

        {/* 📊 결과 UI 영역 */}
        {result && (
          <div ref={resultRef} className="mt-8 bg-[#1E1E1E] p-5 rounded-2xl border border-[#333]">
            <div className="flex flex-col items-center mb-6">
              <Scale className="text-[#FFD60A] w-8 h-8 mb-2" />
              <h2 className="text-2xl font-black text-white">연문철의 판결</h2>
            </div>
            
            {/* 과실 비율 그래프 */}
            <div className="mb-6">
              <div className="flex justify-between text-sm font-bold mb-2">
                <span className="text-[#4A90E2]">남자 {result.ratio_male}%</span>
                <span className="text-[#E94E77]">{result.ratio_female}% 여자</span>
              </div>
              <div className="h-5 flex rounded-full overflow-hidden bg-[#333]">
                <div style={{ width: `${result.ratio_male}%` }} className="bg-[#4A90E2] transition-all duration-1000"></div>
                <div style={{ width: `${result.ratio_female}%` }} className="bg-[#E94E77] transition-all duration-1000"></div>
              </div>
            </div>

            {/* 요약 */}
            <div className="bg-[#2A2A2A] p-4 rounded-xl mb-4">
              <p className="text-sm font-bold text-gray-400 mb-2">💡 사건 요약</p>
              <p className="text-sm text-gray-200 leading-relaxed">{result.summary}</p>
            </div>

            {/* 남녀 과실 세부내용 */}
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-[#2A2A2A] p-4 rounded-xl">
                <p className="text-sm font-bold text-[#4A90E2] mb-1">🙎‍♂️ 남자의 과실</p>
                <p className="text-xs text-gray-300 leading-relaxed mb-3">{result.male_fault}</p>
                
                <p className="text-xs font-bold text-[#FF453A] mb-1">🗣️ 대화 태도</p>
                <p className="text-xs text-gray-300 leading-relaxed mb-3">{result.male_attitude}</p>

                <p className="text-xs font-bold text-gray-400 mb-1">😢 서운함</p>
                <p className="text-xs text-gray-300 leading-relaxed">{result.male_sad}</p>
              </div>

              <div className="w-[1px] bg-[#444] self-stretch my-2"></div>

              <div className="flex-1 bg-[#2A2A2A] p-4 rounded-xl">
                <p className="text-sm font-bold text-[#E94E77] mb-1">🙎‍♀️ 여자의 과실</p>
                <p className="text-xs text-gray-300 leading-relaxed mb-3">{result.female_fault}</p>
                
                <p className="text-xs font-bold text-[#FF453A] mb-1">🗣️ 대화 태도</p>
                <p className="text-xs text-gray-300 leading-relaxed mb-3">{result.female_attitude}</p>

                <p className="text-xs font-bold text-gray-400 mb-1">😢 서운함</p>
                <p className="text-xs text-gray-300 leading-relaxed">{result.female_sad}</p>
              </div>
            </div>

            {/* 최종 솔루션 */}
            <div className="bg-yellow-500/10 border border-[#FFD60A] p-4 rounded-xl mb-6">
              <p className="text-sm font-bold text-[#FFD60A] mb-2">🤝 최종 솔루션</p>
              <p className="text-sm text-white leading-relaxed font-medium">{result.solution}</p>
            </div>

            {/* 저장 & 공유 버튼 */}
            <div className="flex flex-col gap-2">
              <button onClick={handleSaveImage} className="w-full flex items-center justify-center bg-[#333] border border-[#FFD60A] text-[#FFD60A] py-3 rounded-xl font-bold hover:bg-[#444] transition-colors">
                <Download className="w-4 h-4 mr-2" /> 이미지로 저장하기
              </button>
              <button onClick={handleShare} className="w-full flex items-center justify-center bg-[#FEE500] text-[#3C1E1E] py-3 rounded-xl font-black hover:bg-yellow-400 transition-colors">
                <MessageCircle className="w-4 h-4 mr-2" /> 공유하기
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}