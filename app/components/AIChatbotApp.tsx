'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { motion, AnimatePresence } from 'framer-motion';

interface OpenAIRequestData {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
}

const CustomInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
  <Input
    {...props}
    ref={ref}
    className={`
      flex-grow h-[60px] text-[19px] font-normal rounded-full px-6
      border-none !border-0 outline-none !outline-0
      focus:ring-0 focus:ring-offset-0 focus:outline-none !focus:border-0
      placeholder-[#8E8E93]
      ${props.className}
    `}
    style={{
      boxShadow: 'none',
      margin: '0',
      ...props.style,
    }}
  />
));

CustomInput.displayName = 'CustomInput';

const AIChatbotApp: React.FC = () => {
  const [input, setInput] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState("What kind of app would you like to create?");
  const [isLoading, setIsLoading] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const callOpenAI = async (data: OpenAIRequestData) => {
    const response = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    return response.json();
  };

  const generateQuestion = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    
    try {
      const response = await callOpenAI({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Generate a short, engaging follow-up question (max 8 words) to refine an app idea." },
          { role: "user", content: `Previous: "${currentQuestion}". Answer: "${prompt}". Next question:` }
        ],
        max_tokens: 30,
      });

      if (response?.message?.content) {
        setCurrentQuestion(response.message.content);
      } else {
        setCurrentQuestion("Can you elaborate on that?");
      }
    } catch (error) {
      console.error('Error generating question:', error);
      setCurrentQuestion("Let's try a different approach. Any ideas?");
    } finally {
      setIsLoading(false);
    }
  }, [currentQuestion, isLoading]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newInput = e.target.value;
    setInput(newInput);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    const lastChar = newInput.trim().slice(-1);
    const delay = lastChar === '.' ? 0 : lastChar === ',' ? 500 : 1000;

    typingTimeoutRef.current = setTimeout(() => {
      if (newInput.trim() && (lastChar === '.' || lastChar === ',' || delay === 1000)) {
        generateQuestion(newInput);
      }
    }, delay);
  }, [generateQuestion]);

  const handleInputSubmit = () => {
    if (input.trim()) {
      generateQuestion(input);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-between min-h-screen w-full text-foreground p-4 bg-gray-100 font-['SF Pro Display', 'Helvetica', 'Arial', sans-serif] antialiased">
      <div className="w-full max-w-[800px] flex flex-col items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.5 }}
            className="w-full h-[calc(100vh-200px)] flex items-center justify-center overflow-hidden"
          >
            <div className="text-[40px] font-normal text-foreground leading-tight text-center px-4">
              {currentQuestion}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      
      <div className="w-full max-w-[800px] bg-white rounded-[20px] shadow-lg p-3 mt-4">
        <div className="flex items-center gap-3">
          <CustomInput
            value={input}
            onChange={handleInputChange}
            onKeyPress={(e) => e.key === 'Enter' && handleInputSubmit()}
            placeholder="Describe your app idea..."
            className="mt-2 bg-white"
          />
          <Button
            onClick={handleInputSubmit}
            className="rounded-full w-[60px] h-[60px] p-0 flex items-center justify-center bg-primary hover:bg-primary/90 flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6 text-primary-foreground">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIChatbotApp;