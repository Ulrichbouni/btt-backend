export const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

export const hashOTP = (code) => {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = ((h << 5) - h + code.charCodeAt(i)) | 0;
  return String(h);
};
