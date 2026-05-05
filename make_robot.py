from PIL import Image, ImageDraw

def create_robot():
    size = 44
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    
    # Head (Round Circle)
    d.ellipse([4, 12, 40, 42], fill='black')
    
    # Antenna stem
    d.line([22, 12, 22, 4], fill='black', width=4)
    # Antenna ball
    d.ellipse([18, 0, 26, 8], fill='black')
    
    # Modify pixels to cut out eyes and mouth
    pixels = img.load()
    
    # Eyes (circles)
    eye_r = 3
    
    # Left eye center 15, 24
    for x in range(15-eye_r, 15+eye_r+1):
        for y in range(24-eye_r, 24+eye_r+1):
            if (x-15)**2 + (y-24)**2 <= eye_r**2:
                if 0 <= x < size and 0 <= y < size:
                    pixels[x, y] = (0,0,0,0)
                
    # Right eye center 29, 24
    for x in range(29-eye_r, 29+eye_r+1):
        for y in range(24-eye_r, 24+eye_r+1):
            if (x-29)**2 + (y-24)**2 <= eye_r**2:
                if 0 <= x < size and 0 <= y < size:
                    pixels[x, y] = (0,0,0,0)
                
    # Mouth (straight line)
    for x in range(16, 29):
        for y in range(32, 35):
            if 0 <= x < size and 0 <= y < size:
                pixels[x, y] = (0,0,0,0)
            
    img.save('robotTemplate.png')

if __name__ == '__main__':
    create_robot()
